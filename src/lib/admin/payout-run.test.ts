import assert from "node:assert/strict";
import { test } from "node:test";

import { addDaysIso, buildPayoutRun, istDayKey, type RunPlacement } from "./payout-run.ts";

const row = (o: Partial<RunPlacement>): RunPlacement => ({
  nextDate: null,
  monthlyShareMinor: 1000_00,
  remainingMinor: 3000_00,
  totalShareMinor: 6000_00,
  paidMinor: 3000_00,
  employer: null,
  ...o,
});
const TODAY = "2026-11-04";

test("istDayKey uses the Indian calendar day", () => {
  assert.equal(istDayKey(new Date("2026-11-04T20:00:00Z")), "2026-11-05");
  assert.equal(istDayKey(new Date("nope")), "");
});

test("addDaysIso crosses month ends", () => {
  assert.equal(addDaysIso("2026-11-28", 5), "2026-12-03");
});

test("groups by date, one month per placement, soonest first, overdue flagged", () => {
  const run = buildPayoutRun(
    [
      row({ nextDate: "2026-11-10" }),
      row({ nextDate: "2026-11-10", monthlyShareMinor: 500_00 }),
      row({ nextDate: "2026-11-01", remainingMinor: 400_00 }), // last, smaller month than the stipend
      row({ nextDate: "2026-12-20" }),
      row({ nextDate: "2027-03-01" }), // beyond six weeks
    ],
    TODAY,
  );
  assert.deepEqual(run.days.map((d) => [d.date, d.amountMinor, d.count, d.overdue]), [
    ["2026-11-01", 400_00, 1, true],
    ["2026-11-10", 1500_00, 2, false],
    ["2026-12-20", 1000_00, 1, false],
    ["2027-03-01", 1000_00, 1, false],
  ]);
  assert.equal(run.next?.date, "2026-11-01");
  assert.deepEqual(run.overdue, { amountMinor: 400_00, count: 1, days: 1 });
  assert.equal(run.weeks.length, 6);
  assert.equal(run.weeks[0].count, 2);
  assert.equal(run.weeks[0].amountMinor, 1500_00);
  assert.equal(run.weeks[5].count, 0);
  assert.equal(run.maxWeekMinor, 1500_00);
  assert.deepEqual(run.later, { amountMinor: 2000_00, count: 2 }); // 20 Dec and 1 Mar
});

test("finished placements and ones without a date add no run day but totals still count", () => {
  const run = buildPayoutRun(
    [
      row({ nextDate: null, remainingMinor: 0, paidMinor: 6000_00 }),
      row({ nextDate: null, remainingMinor: 2000_00 }),
    ],
    TODAY,
  );
  assert.equal(run.days.length, 0);
  assert.equal(run.next, null);
  assert.equal(run.flow.dueMinor, 2000_00);
  assert.equal(run.flow.paidMinor, 9000_00);
  assert.equal(run.totalMinor, 12000_00);
  assert.equal(run.paidFraction, 0.75);
});

test("employer money received is what the employer has covered, never negative", () => {
  const run = buildPayoutRun(
    [
      row({ employer: { months: 3, monthlyInrMinor: 1000_00, dueInrMinor: 1000_00 } }),
      row({ employer: { months: 2, monthlyInrMinor: 100_00, dueInrMinor: 900_00 } }),
    ],
    TODAY,
  );
  assert.equal(run.flow.receivedMinor, 2000_00);
});

test("empty input and a bad today are safe", () => {
  const run = buildPayoutRun([], "");
  assert.equal(run.paidFraction, 0);
  assert.deepEqual(run.weeks, []);
  assert.equal(run.next, null);
  assert.equal(buildPayoutRun([row({ nextDate: "2026-11-01" })], "").overdue.count, 0);
});
