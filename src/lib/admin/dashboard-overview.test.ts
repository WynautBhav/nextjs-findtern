import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activityWhen,
  buildActivity,
  buildKpis,
  istWeekKeys,
  istWeekStart,
  placementSummary,
  queueRowHref,
  queueRows,
  safeMeetingLink,
  toNextInterview,
  weekBars,
} from "./dashboard-overview-pure.ts";
import type { QueueGroup, QueueRecord } from "./dashboard-queues.types.ts";

const NOW = new Date("2026-11-04T06:00:00Z"); // Wednesday 4 Nov, 11:30 IST

test("the India week runs Monday to Sunday and always has seven days", () => {
  assert.deepEqual(istWeekKeys(NOW), [
    "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08",
  ]);
  // Sunday evening UTC is already Monday in India: the week has moved on.
  assert.equal(istWeekKeys(new Date("2026-11-08T19:00:00Z"))[0], "2026-11-09");
  // Sunday itself is the last day of its own week.
  assert.equal(istWeekKeys(new Date("2026-11-08T06:00:00Z"))[6], "2026-11-08");
  assert.equal(istWeekStart(NOW)?.toISOString(), "2026-11-01T18:30:00.000Z");
  assert.deepEqual(istWeekKeys(new Date("nope")), []);
});

test("weekBars: past, today and future states, counts land on their day, and the parts add up to the total", () => {
  const { bars, total } = weekBars(NOW, [
    { day: "2026-11-02", value: 3 },
    { day: "2026-11-04", value: 2 },
    { day: "2026-11-04", value: 1 }, // the same day twice adds up
    { day: "2026-11-01", value: 9 }, // last week: not in this one
    { day: "2026-11-06", value: 4 }, // a future day cannot have records
  ]);
  assert.deepEqual(
    bars.map((b) => [b.label, b.value, b.state]),
    [
      ["Mon", 3, "past"],
      ["Tue", 0, "past"],
      ["Wed", 3, "today"],
      ["Thu", 0, "future"],
      ["Fri", 0, "future"],
      ["Sat", 0, "future"],
      ["Sun", 0, "future"],
    ],
  );
  assert.equal(total, 6);
  assert.equal(total, bars.reduce((s, b) => s + b.value, 0));
});

test("weekBars with no rows is an honest empty week", () => {
  const { bars, total } = weekBars(NOW, []);
  assert.equal(bars.length, 7);
  assert.equal(total, 0);
});

test("safeMeetingLink only passes http(s) links", () => {
  assert.equal(safeMeetingLink("https://meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij");
  assert.equal(safeMeetingLink("  http://example.com/x "), "http://example.com/x");
  assert.equal(safeMeetingLink("javascript:alert(1)"), null);
  assert.equal(safeMeetingLink("meet.google.com/abc"), null);
  assert.equal(safeMeetingLink("   "), null);
  assert.equal(safeMeetingLink(null), null);
});

test("toNextInterview: name, company, India time, and a join link only when there is a safe one", () => {
  const slot = new Date("2026-11-06T10:00:00Z"); // 3:30 PM IST
  const row = { id: "i1", internId: "u1", first: "Ira", last: "Zug", company: "Brightwell", slot, meetingLink: "https://meet.example/x" };
  const next = toNextInterview(row, NOW);
  assert.equal(next?.candidate, "Ira Zug");
  assert.equal(next?.company, "Brightwell");
  assert.match(next?.whenLabel ?? "", /3:30 PM IST/);
  assert.equal(next?.joinHref, "https://meet.example/x");
  assert.equal(toNextInterview({ ...row, meetingLink: "" }, NOW)?.joinHref, null);
  assert.equal(toNextInterview({ ...row, meetingLink: "javascript:x" }, NOW)?.joinHref, null);
  assert.equal(toNextInterview({ ...row, first: null, last: null, company: null }, NOW)?.candidate, "Candidate");
});

test("toNextInterview is null when there is nothing, no slot, or the slot has passed", () => {
  assert.equal(toNextInterview(null, NOW), null);
  const base = { id: "i1", internId: "u1", first: "A", last: "B", company: "C", meetingLink: null };
  assert.equal(toNextInterview({ ...base, slot: null }, NOW), null);
  assert.equal(toNextInterview({ ...base, slot: new Date("2026-11-04T05:00:00Z") }, NOW), null);
});

test("placementSummary: the segments add up to the total and the centre is the share paid", () => {
  const p = placementSummary({ paid: 22, awaiting: 13 });
  assert.equal(p.total, 35);
  assert.equal(p.segments.reduce((s, x) => s + x.value, 0), p.total);
  assert.equal(p.paidPct, 63);
  assert.deepEqual(p.segments.map((s) => s.label), ["Paid", "Awaiting payment"]);
});

test("placementSummary: no placements is 0%, bad numbers count as zero", () => {
  const none = placementSummary({ paid: 0, awaiting: 0 });
  assert.deepEqual([none.total, none.paidPct], [0, 0]);
  const odd = placementSummary({ paid: Number.NaN, awaiting: -4 });
  assert.equal(odd.total, 0);
  assert.equal(placementSummary({ paid: 5, awaiting: 0 }).paidPct, 100);
});

test("buildKpis: with-profile plus incomplete equals signups, and the placement tile is the gauge's total", () => {
  const placements = placementSummary({ paid: 22, awaiting: 13 });
  const { kpis, withProfile } = buildKpis({
    queueTotal: 17,
    queueFresh: 4,
    queueFailed: false,
    signups: 1200,
    incompleteProfiles: 300,
    signupsThisWeek: 25,
    companies: 80,
    companiesThisWeek: 3,
    placements,
  });
  assert.equal(withProfile + 300, 1200);
  assert.deepEqual(kpis.map((k) => k.key), ["needs", "candidates", "companies", "placements"]);
  const by = Object.fromEntries(kpis.map((k) => [k.key, k]));
  assert.equal(by.needs.value, 17);
  assert.equal(by.needs.caption, "4 new this week");
  assert.equal(by.candidates.value, 900);
  assert.match(by.candidates.caption, /25 new signups this week, 1,200 in all/);
  assert.equal(by.companies.caption, "3 new this week");
  assert.equal(by.placements.value, placements.total);
  assert.equal(by.placements.caption, "22 paid, 13 awaiting payment");
});

test("buildKpis: a failed read drops its tile, a failed queue is said, an empty queue is honest", () => {
  const base = { queueTotal: 0, queueFresh: 0, queueFailed: false, signups: 0, incompleteProfiles: 0, signupsThisWeek: 1, companies: null, companiesThisWeek: null, placements: null };
  const empty = buildKpis(base);
  assert.deepEqual(empty.kpis.map((k) => k.key), ["needs", "candidates"]);
  assert.equal(empty.kpis[0].caption, "Nothing waiting on the team");
  assert.match(empty.kpis[1].caption, /1 new signup this week/);
  assert.equal(buildKpis({ ...base, queueTotal: 3, queueFailed: true }).kpis[0].caption, "Some queues did not load");
  // New this week can never exceed the total it is part of.
  assert.equal(buildKpis({ ...base, queueTotal: 2, queueFresh: 9 }).kpis[0].caption, "2 new this week");
  // More incomplete than signups cannot make a negative profile count.
  assert.equal(buildKpis({ ...base, signups: 5, incompleteProfiles: 9 }).withProfile, 0);
});

test("buildActivity merges the four sources, newest first, with a verb, an object and a status chip", () => {
  const d = (iso: string) => new Date(iso);
  const items = buildActivity({
    recentUsers: [{ id: "u1", name: "Ira Zug", date: d("2026-11-04T05:00:00Z") }],
    recentProjects: [{ name: "Data entry", company: "Acme", employerId: "e1", date: d("2026-11-03T05:00:00Z") }],
    recentAccepted: [{ internId: "u2", first: "Ravi", last: "K", company: "Acme", date: d("2026-11-04T04:00:00Z") }],
    recentPayments: [{ employerId: "e1", amountMinor: 1_500_000, currency: "INR", company: "Acme", date: d("2026-11-04T05:30:00Z") }],
  });
  assert.deepEqual(items.map((i) => i.kind), ["payment", "signup", "offer", "project"]);
  assert.equal(items[0].object, "₹15,000");
  assert.equal(items[0].verb, "paid");
  assert.equal(items[0].href, "/admin/orders");
  assert.equal(items[2].href, "/admin/interns/u2");
  assert.equal(items[3].href, "/admin/companies/e1");
  assert.ok(items.every((i) => i.status.label.length > 0 && i.name.length > 0));
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
});

test("buildActivity drops undated rows, fills missing names, and respects the limit", () => {
  const items = buildActivity({
    recentUsers: [
      { id: "u1", name: "  ", date: new Date("2026-11-04T05:00:00Z") },
      { id: "u2", name: "No date", date: null },
    ],
    recentProjects: [],
    recentAccepted: [{ internId: "u3", first: null, last: null, company: null, date: new Date("2026-11-04T04:00:00Z") }],
    recentPayments: [],
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "New candidate");
  assert.equal(items[1].name, "Candidate");
  assert.equal(items[1].object, "an employer");
  assert.equal(buildActivity({ recentUsers: items.map((i, n) => ({ id: `x${n}`, name: "A", date: i.at })), recentProjects: [], recentAccepted: [], recentPayments: [] }, 1).length, 1);
});

test("activityWhen: today and yesterday with the India clock, older as a date", () => {
  assert.equal(activityWhen(new Date("2026-11-04T04:30:00Z"), NOW), "Today, 10:00");
  assert.equal(activityWhen(new Date("2026-11-03T04:30:00Z"), NOW), "Yesterday, 10:00");
  assert.equal(activityWhen(new Date("2026-10-20T04:30:00Z"), NOW), "20 Oct");
});

const rec = (queue: QueueRecord["queue"], extra: Partial<QueueRecord> = {}): QueueRecord => ({
  id: `${queue}:1`, queue, title: "T", subtitle: "", amountMinorInr: null, ageDays: null, when: null, href: "/x", props: [], ...extra,
});
const group = (key: QueueGroup["key"], extra: Partial<QueueGroup> = {}): QueueGroup => ({
  key, label: key, detail: "", count: 0, fresh: 0, moreHref: `/more/${key}`, moreLabel: "More", records: [], ...extra,
});

test("queueRows: one row per queue, the oldest age of what is shown, zero and failed queues never read as work", () => {
  const now = NOW.getTime();
  const rows = queueRows(
    [
      group("calendar", { flag: true, count: 1 }),
      group("payouts", { count: 4, records: [rec("payouts", { ageDays: 6 }), rec("payouts", { ageDays: 2 })] }),
      group("nolink", { count: 1, records: [rec("nolink", { when: new Date(now + 5 * 3_600_000).toISOString() })] }),
      group("unscored", { count: 0 }),
      group("messages", { error: true }),
      group("accepted", { count: 2, records: [rec("accepted", { ageDays: 0 })] }),
      group("sheets", { count: 3, records: [rec("sheets")] }),
    ],
    now,
  );
  assert.deepEqual(rows.map((r) => [r.key, r.count, r.note, r.state]), [
    ["calendar", null, "Not connected", "flag"],
    ["payouts", 4, "oldest 6 d", "work"],
    ["nolink", 1, "next in 5 h", "work"],
    ["unscored", 0, "Clear", "clear"],
    ["messages", null, "Could not load", "error"],
    ["accepted", 2, "oldest today", "work"],
    ["sheets", 3, "", "work"],
  ]);
  assert.equal(rows.length, 7);
});

test("queueRowHref: queues open the desk on that queue, a state opens the page that fixes it", () => {
  const rows = queueRows([group("calendar", { flag: true, count: 1 }), group("payouts", { count: 1, records: [rec("payouts")] })], NOW.getTime());
  assert.equal(queueRowHref(rows[0], group("calendar", { moreHref: "/admin/settings" })), "/admin/settings");
  assert.equal(queueRowHref(rows[1], undefined), "/admin/dashboard?desk=1&queue=payouts");
});
