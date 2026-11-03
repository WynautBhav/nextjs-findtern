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
    profilesThisWeek: 25,
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
  assert.equal(by.candidates.caption, "with a profile · 25 new this week");
  assert.equal(by.companies.caption, "3 new this week");
  assert.equal(by.placements.value, placements.total);
  assert.equal(by.placements.caption, "22 paid, 13 awaiting payment");
});

test("buildKpis: a failed read drops its tile, a failed queue is said, an empty queue is honest", () => {
  const base = { queueTotal: 0, queueFresh: 0, queueFailed: false, signups: 0, incompleteProfiles: 0, profilesThisWeek: 1, companies: null, companiesThisWeek: null, placements: null };
  const empty = buildKpis(base);
  assert.deepEqual(empty.kpis.map((k) => k.key), ["needs", "candidates"]);
  assert.equal(empty.kpis[0].caption, "Nothing waiting on the team");
  assert.equal(empty.kpis[1].caption, "No finished profiles yet");
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

// ---------------------------------------------------------------- hire pipeline band

import { BAND_STAGES, buildPipelineBand, offerValue, stuckStage, type BandRow } from "./dashboard-overview-pure.ts";

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const row = (id: string, status: string, ago: number | null, extra: Partial<BandRow> = {}): BandRow => ({
  id,
  status,
  internId: `i-${id}`,
  first: "Asha",
  last: id.toUpperCase(),
  company: "Brightwell",
  since: ago == null ? null : daysAgo(ago),
  offerDetails: { monthlyAmount: 30000, duration: "6m" },
  currency: "INR",
  ...extra,
});

test("the band has the five open stages in pipeline order", () => {
  assert.deepEqual(BAND_STAGES.map((s) => s.key), ["sent", "interview", "accepted", "processing", "hired"]);
});

test("offer value follows the tracker: full-time CTC, else total, else monthly x months", () => {
  assert.equal(offerValue({ monthlyAmount: 30000, duration: "6m" }, "INR").minor, 18_000_000);
  assert.equal(offerValue({ totalPrice: 50000, monthlyAmount: 1 }, "INR").minor, 5_000_000);
  assert.deepEqual(offerValue({}, "USD"), { minor: null, currency: "USD" });
});

test("stages count their rows, draft joins sent, strays are ignored, oldest waits first", () => {
  const band = buildPipelineBand(
    [row("a", "sent", 1), row("b", "draft", 6), row("c", "interview_scheduled", 2), row("d", "accepted", 9), row("e", "rejected", 30)],
    0,
    NOW,
  );
  const by = Object.fromEntries(band.stages.map((s) => [s.key, s]));
  assert.equal(by.sent.count, 2);
  assert.deepEqual(by.sent.cards.map((c) => c.id), ["b", "a"]);
  assert.equal(by.sent.oldestDays, 6);
  assert.equal(by.interview.count, 1);
  assert.equal(by.processing.count, 0);
  assert.equal(by.processing.oldestDays, null);
  assert.equal(band.total, 4); // the rejected row is on no stage
});

test("totals are per currency and are never summed across INR and USD", () => {
  const band = buildPipelineBand(
    [row("a", "accepted", 1), row("b", "accepted", 2, { currency: "USD", offerDetails: { monthlyAmount: 1000, duration: "3m" } })],
    0,
    NOW,
  );
  const accepted = band.stages.find((s) => s.key === "accepted");
  assert.deepEqual(accepted?.totals.map((t) => t.currency).sort(), ["INR", "USD"]);
  assert.equal(accepted?.totals.find((t) => t.currency === "INR")?.minor, 18_000_000);
  assert.equal(accepted?.totals.find((t) => t.currency === "USD")?.minor, 300_000);
});

test("Hired takes its count from the all-time figure, shows the most recent, and has no total", () => {
  const band = buildPipelineBand([row("h1", "hired", 5), row("h2", "hired", 1)], 22, NOW);
  const hired = band.stages.find((s) => s.key === "hired");
  assert.equal(hired?.count, 22);
  assert.deepEqual(hired?.cards.map((c) => c.id), ["h2", "h1"]);
  assert.deepEqual(hired?.totals, []);
  assert.equal(hired?.oldestDays, null);
});

test("the stuck stage is the open one waiting longest, at least 3 days, never Hired", () => {
  assert.equal(buildPipelineBand([row("a", "sent", 2), row("b", "accepted", 2)], 0, NOW).stuck, null);
  assert.equal(buildPipelineBand([row("a", "sent", 4), row("b", "accepted", 9)], 0, NOW).stuck, "accepted");
  assert.equal(buildPipelineBand([row("a", "sent", 5), row("b", "processing", 5)], 0, NOW).stuck, "processing"); // tie: the later stage
  assert.equal(buildPipelineBand([row("h", "hired", 40)], 1, NOW).stuck, null);
  assert.equal(stuckStage([]), null);
});

test("an undated row is counted, shows no waiting time and cannot make a stage stuck", () => {
  const band = buildPipelineBand([row("a", "sent", null)], 0, NOW);
  assert.equal(band.stages[0].count, 1);
  assert.equal(band.stages[0].cards[0].waitingDays, null);
  assert.equal(band.stuck, null);
});

import { greetingFor, heroKey, relativeWhen, untilWhen, type Kpi } from "./dashboard-overview-pure.ts";

test("heroKey never picks a zero tile and falls back in order", () => {
  const k = (key: Kpi["key"], value: number): Kpi => ({ key, label: key, value, caption: "" });
  assert.equal(heroKey([k("needs", 45), k("candidates", 133)]), "needs");
  assert.equal(heroKey([k("needs", 0), k("candidates", 133), k("placements", 40)]), "placements");
  assert.equal(heroKey([k("needs", 0), k("candidates", 0), k("companies", 3)]), "companies");
  assert.equal(heroKey([k("needs", 0), k("candidates", 0)]), null);
});

test("relativeWhen and untilWhen read as real, different times", () => {
  const now = new Date("2026-11-04T10:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  assert.equal(relativeWhen(ago(10_000), now), "just now");
  assert.equal(relativeWhen(ago(12 * 60_000), now), "12 min ago");
  assert.equal(relativeWhen(ago(3 * 3_600_000), now), "3 h ago");
  assert.equal(relativeWhen(ago(2 * 86_400_000), now), "2 d ago");
  assert.equal(untilWhen(new Date(now.getTime() + 20 * 60_000), now), "in 20 min");
  assert.equal(untilWhen(new Date(now.getTime() + 5 * 3_600_000), now), "in 5 h");
  assert.equal(untilWhen(new Date(now.getTime() + 3 * 86_400_000), now), "in 3 days");
  assert.equal(untilWhen(ago(1000), now), null);
});

test("greetingFor uses the India clock", () => {
  assert.equal(greetingFor(new Date("2026-11-04T03:00:00Z")), "Good morning"); // 08:30 IST
  assert.equal(greetingFor(new Date("2026-11-04T08:00:00Z")), "Good afternoon"); // 13:30 IST
  assert.equal(greetingFor(new Date("2026-11-04T16:00:00Z")), "Good evening"); // 21:30 IST
});
