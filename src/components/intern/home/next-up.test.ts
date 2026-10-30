import { test } from "node:test";
import assert from "node:assert/strict";

import { daysAway, pickNextUp } from "./next-up.ts";

// 29 Oct 2026, 10:00 IST.
const now = new Date("2026-10-29T04:30:00Z");

test("timesheet: the next uncovered period that has not started", () => {
  const next = pickNextUp({
    now,
    interview: null,
    payoutDue: null,
    sheet: { startDate: "2026-09-08", months: 3, taken: [{ start: "2026-09-08", end: "2026-10-07" }, { start: "2026-10-08", end: "2026-11-07" }] },
  });
  assert.deepEqual(next, { kind: "timesheet", day: "2026-11-08", end: "2026-12-07", at: null });
});

test("earliest wins; a past payout date is not next", () => {
  const next = pickNextUp({
    now,
    interview: new Date("2026-11-02T05:30:00Z"),
    payoutDue: new Date("2026-10-20T00:00:00Z"),
    sheet: { startDate: "2026-09-08", months: 3, taken: [{ start: "2026-09-08", end: "2026-11-07" }] },
  });
  assert.equal(next?.kind, "interview");
  assert.equal(next?.day, "2026-11-02");
});

test("nothing dated means no tile", () => {
  assert.equal(pickNextUp({ now, interview: null, payoutDue: null, sheet: { startDate: null, months: 3, taken: [] } }), null);
});

test("daysAway", () => {
  assert.equal(daysAway("2026-10-29", "2026-10-29"), "Today");
  assert.equal(daysAway("2026-10-29", "2026-10-30"), "Tomorrow");
  assert.equal(daysAway("2026-10-29", "2026-11-08"), "In 10 days");
});
