import assert from "node:assert/strict";
import { test } from "node:test";

import { addDaysIso, buildPayoutRun, formatRunDate, istDayKey, type RunPlacement } from "./payout-run.ts";

let seq = 0;
const row = (o: Partial<RunPlacement>): RunPlacement => ({
  internId: `i${++seq}`,
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
  assert.equal(run.next?.date, "2026-11-10"); // next UPCOMING run, not the overdue date
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
  assert.equal(run.totalMinor, 11000_00); // paid + still owed
  assert.equal(run.paidFraction, 9000 / 11000);
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

test("next run skips overdue dates; overdue sums every passed date", () => {
  const run = buildPayoutRun(
    [
      row({ nextDate: "2026-09-11" }),
      row({ nextDate: "2026-10-30", remainingMinor: 400_00 }),
      row({ nextDate: "2026-11-04" }), // today is upcoming, not overdue
    ],
    TODAY,
  );
  assert.equal(run.next?.date, "2026-11-04");
  assert.equal(run.next?.overdue, false);
  assert.deepEqual(run.overdue, { amountMinor: 1400_00, count: 2, days: 2 });
});

test("only overdue dates: nothing upcoming, overdue still reported", () => {
  const run = buildPayoutRun([row({ nextDate: "2026-09-11" })], TODAY);
  assert.equal(run.next, null);
  assert.equal(run.overdue.count, 1);
});

test("counts distinct interns, not placements", () => {
  const run = buildPayoutRun(
    [
      row({ internId: "a", nextDate: "2026-11-10" }),
      row({ internId: "a", nextDate: "2026-11-10" }),
      row({ internId: "a", nextDate: "2026-11-12" }),
      row({ internId: "b", nextDate: "2026-11-12" }),
      row({ internId: "a", nextDate: "2026-09-01" }),
      row({ internId: "a", nextDate: "2026-09-02" }),
      row({ internId: "c", nextDate: "2027-03-01" }),
      row({ internId: "c", nextDate: "2027-03-02" }),
    ],
    TODAY,
  );
  assert.equal(run.days.find((d) => d.date === "2026-11-10")?.count, 1);
  assert.equal(run.days.find((d) => d.date === "2026-11-10")?.amountMinor, 2000_00); // money still per placement
  assert.equal(run.weeks[0].count, 1); // a twice on 10 Nov
  assert.equal(run.weeks[1].count, 2); // a and b on 12 Nov
  assert.equal(run.overdue.count, 1);
  assert.equal(run.later.count, 1);
});

test("paid out comes from the ledger when given, even if no payout is linked to a placement", () => {
  const rows = [row({ paidMinor: 0, remainingMinor: 3000_00 }), row({ paidMinor: 0, remainingMinor: 1000_00 })];
  const linked = buildPayoutRun(rows, TODAY);
  assert.equal(linked.flow.paidMinor, 0);
  const run = buildPayoutRun(rows, TODAY, 766_220_00);
  assert.equal(run.flow.paidMinor, 766_220_00);
  assert.equal(run.flow.dueMinor, 4000_00);
  assert.equal(run.totalMinor, 770_220_00);
  assert.ok(run.paidFraction > 0.99 && run.paidFraction <= 1);
  assert.equal(buildPayoutRun(rows, TODAY, 0).flow.paidMinor, 0);
});

test("dates show the year unless they are in today's year", () => {
  assert.equal(formatRunDate("2026-09-11", TODAY, { weekday: true }), "Fri, 11 Sept");
  assert.match(formatRunDate("2025-09-11", TODAY, { weekday: true }), /2025/);
  assert.match(formatRunDate("2027-01-02", TODAY), /2027/);
  assert.doesNotMatch(formatRunDate("2026-12-20", TODAY), /2026/);
  assert.match(formatRunDate("2026-12-20", ""), /2026/);
});
