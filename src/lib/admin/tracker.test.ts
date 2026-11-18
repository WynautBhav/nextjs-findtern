import assert from "node:assert/strict";
import { test } from "node:test";

import { filterInterviews, filterProposals, ineligibleInterns, matchesSearch, paginate, parseIstDay, proposalTimezone, sortBy } from "./tracker.ts";

const none = { from: null, to: null, company: "", intern: "", tz: "" };
const p = (over: Record<string, unknown>) => ({
  id: "p",
  status: "sent",
  flowType: "direct",
  currency: "INR",
  offerDetails: {},
  createdAt: new Date("2026-10-10T10:00:00Z"),
  hiredAt: null,
  internId: "i1",
  employerId: "e1",
  projectTimezone: null,
  ...over,
});

test("timezone comes from the offer, then full-time block, then project", () => {
  assert.equal(proposalTimezone(p({ offerDetails: { timezone: "America/New_York" } })), "America/New_York");
  assert.equal(proposalTimezone(p({ offerDetails: { fullTimeOffer: { timezone: "Europe/London" } } })), "Europe/London");
  assert.equal(proposalTimezone(p({ projectTimezone: "Asia/Dubai" })), "Asia/Dubai");
  assert.equal(proposalTimezone(p({})), null);
});

test("exact company / candidate ids and timezone filter (ADP-12)", () => {
  const rows = [p({ id: "a" }), p({ id: "b", employerId: "e2" }), p({ id: "c", internId: "i2", offerDetails: { timezone: "Asia/Kolkata" } })];
  assert.deepEqual(filterProposals(rows, { ...none, company: "e1" }).map((r) => r.id), ["a", "c"]);
  assert.deepEqual(filterProposals(rows, { ...none, intern: "i2" }).map((r) => r.id), ["c"]);
  assert.deepEqual(filterProposals(rows, { ...none, tz: "Asia/Kolkata" }).map((r) => r.id), ["c"]);
  const iv = [
    { id: "x", status: "scheduled", createdAt: null, internId: "i1", employerId: "e1", timezone: null },
    { id: "y", status: "scheduled", createdAt: null, internId: "i1", employerId: "e1", timezone: "America/New_York" },
  ];
  // A missing interview timezone is IST (legacy default).
  assert.deepEqual(filterInterviews(iv, { ...none, tz: "Asia/Kolkata" }).map((r) => r.id), ["x"]);
});

test("IST day bounds are inclusive", () => {
  const from = parseIstDay("2026-10-10");
  const to = parseIstDay("2026-10-10", true);
  const rows = [p({ id: "in", createdAt: new Date("2026-10-10T18:00:00Z") }), p({ id: "out", createdAt: new Date("2026-10-10T18:31:00Z") })];
  assert.deepEqual(filterProposals(rows, { ...none, from, to }).map((r) => r.id), ["in"]);
  assert.equal(parseIstDay("10/10/2026"), null);
});

test("search, sort and pagination helpers", () => {
  assert.equal(matchesSearch(["Asha Rao", "acme"], "asha acme"), true);
  assert.equal(matchesSearch(["Asha Rao"], "asha acme"), false);
  assert.deepEqual(sortBy([{ v: 2 }, { v: null }, { v: 1 }], (r) => r.v, "asc").map((r) => r.v), [1, 2, null]);
  const pg = paginate([1, 2, 3, 4, 5], 9, 2);
  assert.deepEqual([pg.rows, pg.page, pg.pages, pg.total], [[5], 3, 3, 5]);
});

test("pipeline flag matches the intern's guarantee state", () => {
  const now = new Date("2026-11-04T06:00:00Z");
  const dec = (internId: string) => p({ internId, status: "rejected", offerDetails: { declinedBy: "intern" } });
  const rows = [dec("a"), dec("a"), dec("a"), p({ internId: "a", offerDetails: { startDate: "2026-11-01" } }), dec("b"), dec("b"), dec("b"), dec("c")];
  const flagged = ineligibleInterns(rows, new Map([["c", { guaranteeEndedAt: "2026-11-01T00:00:00Z" }]]), now);
  assert.deepEqual([...flagged].sort(), ["a", "c"]);
});

// ── True status on the pipeline (the owner's screenshot: "Scheduled" for meetings already over) ──
import { upcomingInterviewCount, withTrueInterviewStatus, withTrueProposalStatus } from "./tracker.ts";

const T0 = Date.parse("2026-11-18T10:00:00Z");
const iv = (status: string, startOffsetMin: number | null, extra: Record<string, unknown> = {}) => ({
  status,
  slot1: startOffsetMin === null ? null : new Date(T0 + startOffsetMin * 60_000),
  slot2: null,
  slot3: null,
  selectedSlot: startOffsetMin === null ? null : 1,
  employerId: "emp-1",
  ...extra,
});

test("interviews: a passed meeting reads expired, the header counts only future scheduled ones, and the tab filter agrees", () => {
  const rows = withTrueInterviewStatus(
    [iv("scheduled", -330), iv("scheduled", -3 * 1440), iv("completed", -1440), iv("cancelled", -60), iv("scheduled", 120)],
    T0,
  );
  assert.deepEqual(rows.map((r) => r.status), ["expired", "expired", "completed", "cancelled", "scheduled"]);
  assert.deepEqual(rows.map((r) => r.storedStatus), ["scheduled", "scheduled", "completed", "cancelled", "scheduled"]);
  assert.equal(upcomingInterviewCount(rows, T0), 1);
  assert.equal(rows.filter((r) => r.status === "scheduled").length, upcomingInterviewCount(rows, T0), "Scheduled filter and header agree");
  assert.equal(rows.filter((r) => r.status === "expired")[0]!.lifecycle.reason, "Time passed, not marked complete");
});

test("interviews: in progress is not upcoming and not expired", () => {
  const rows = withTrueInterviewStatus([iv("scheduled", -10)], T0);
  assert.equal(rows[0]!.status, "scheduled");
  assert.equal(upcomingInterviewCount(rows, T0), 0);
});

const offer = (status: string, startDate: string, extra: Record<string, unknown> = {}) => ({
  id: `p-${status}-${startDate}`,
  status,
  hiredAt: null,
  currency: "INR",
  offerDetails: { startDate },
  ...extra,
});

test("proposals: a sent or interview-booked offer past its start day reads expired; accepted, hired, processing, withdrawn keep their meaning", () => {
  const now = new Date("2026-11-18T10:00:00Z"); // 15:30 IST on the 18th
  const rows = withTrueProposalStatus(
    [offer("sent", "2026-11-17"), offer("interview_scheduled", "2026-11-17"), offer("sent", "2026-11-25"), offer("sent", "2026-11-18"), offer("accepted", "2026-11-17"), offer("accepted", "2026-11-25"), offer("processing", "2026-11-01"), offer("hired", "2026-11-01", { hiredAt: new Date("2026-11-02") }), offer("withdrawn", "2026-11-01"), offer("rejected", "2026-11-01")],
    now,
  );
  assert.deepEqual(
    rows.map((r) => r.status),
    ["expired", "expired", "sent", "expired", "expired", "accepted", "processing", "hired", "withdrawn", "rejected"],
  );
  assert.equal(rows[0]!.storedStatus, "sent", "the stored status rides along for the actions");
});

test("proposals: an accepted offer with an open payment order is frozen, not expired", () => {
  const p = offer("accepted", "2026-11-17");
  const [row] = withTrueProposalStatus([p], new Date("2026-11-18T10:00:00Z"), new Set([p.id]));
  assert.equal(row!.status, "accepted");
});
