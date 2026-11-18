import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPayoutRun, type RunPlacement } from "../../../lib/admin/payout-run.ts";
import { daysBetween, leadOf, relative, scheduleRows } from "./po-model.ts";

let seq = 0;
const row = (o: Partial<RunPlacement>): RunPlacement => ({
  internId: `i${++seq}`,
  nextDate: null,
  monthlyShareMinor: 12_500_00,
  remainingMinor: 37_500_00,
  totalShareMinor: 37_500_00,
  paidMinor: 0,
  employer: null,
  ...o,
});
const TODAY = "2026-11-18";

test("relative wording and day maths", () => {
  assert.equal(daysBetween("2026-11-18", "2026-12-21"), 33);
  assert.equal(relative("2026-12-21", TODAY), "In 33 days");
  assert.equal(relative("2026-11-18", TODAY), "Today");
  assert.equal(relative("2026-11-19", TODAY), "Tomorrow");
  assert.equal(relative("2026-11-17", TODAY), "1 day overdue");
  assert.equal(relative("2026-09-03", TODAY), "76 days overdue");
});

test("lead: the next run when nothing is overdue", () => {
  const run = buildPayoutRun([row({ nextDate: "2026-12-21" }), row({ nextDate: "2026-12-21" })], TODAY);
  assert.deepEqual(leadOf(run), { kind: "next", date: "2026-12-21", amountMinor: 25_000_00, count: 2 });
});

test("lead: overdue leads, the next run rides along, and the two are disjoint", () => {
  const run = buildPayoutRun(
    [row({ nextDate: "2026-09-03" }), row({ nextDate: "2026-10-03", monthlyShareMinor: 10_000_00 }), row({ nextDate: "2026-12-21" })],
    TODAY,
  );
  const lead = leadOf(run);
  assert.equal(lead.kind, "overdue");
  if (lead.kind !== "overdue") return;
  assert.equal(lead.amountMinor, 22_500_00); // 12,500 + 10,000, not the 12,500 on the next run
  assert.equal(lead.count, 2);
  assert.equal(lead.oldestDate, "2026-09-03");
  assert.deepEqual(lead.next, { date: "2026-12-21", amountMinor: 12_500_00, count: 1 });
});

test("lead: only overdue, and nothing at all", () => {
  const onlyLate = leadOf(buildPayoutRun([row({ nextDate: "2026-11-01" })], TODAY));
  assert.equal(onlyLate.kind, "overdue");
  if (onlyLate.kind === "overdue") assert.equal(onlyLate.next, null);
  assert.deepEqual(leadOf(buildPayoutRun([], TODAY)), { kind: "none" });
});

test("schedule: six week rows, empty weeks say none (share 0), bars are shares of the busiest week", () => {
  const run = buildPayoutRun(
    [row({ nextDate: "2026-12-21" }), row({ nextDate: "2026-12-24" }), row({ nextDate: "2026-12-24" }), row({ nextDate: "2027-03-01" })],
    TODAY,
  );
  const { rows, maxMinor, horizon } = scheduleRows(run, TODAY);
  assert.equal(horizon, "29 Dec");
  assert.equal(rows.filter((r) => r.kind === "week").length, 6);
  assert.equal(rows[0].label, "This week");
  assert.equal(rows[0].share, 0);
  assert.equal(maxMinor, 25_000_00);
  const busy = rows.find((r) => r.count === 2)!; // 23-29 Dec: 24 Dec, two interns
  assert.equal(busy.share, 1);
  const quiet = rows.find((r) => r.amountMinor === 12_500_00 && r.kind === "week")!; // 16-22 Dec
  assert.equal(quiet.share, 0.5);
  const later = rows.at(-1)!;
  assert.deepEqual([later.kind, later.count, later.amountMinor, later.share], ["later", 1, 12_500_00, null]);
});

test("schedule: an overdue row comes first and has no bar", () => {
  const run = buildPayoutRun([row({ nextDate: "2026-09-03" })], TODAY);
  const { rows } = scheduleRows(run, TODAY);
  assert.equal(rows[0].kind, "overdue");
  assert.equal(rows[0].share, null);
  assert.equal(rows[0].amountMinor, 12_500_00);
  assert.ok(rows.slice(1).every((r) => r.share === 0));
});
