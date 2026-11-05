import assert from "node:assert/strict";
import { test } from "node:test";

import { internMoney, matchesDue, todayIstIso } from "./intern-list.ts";
import type { StipendDue } from "./stipend-dues.ts";

const due = (over: Partial<StipendDue>): StipendDue => ({
  totalShareMinor: 1_500_000,
  paidMinor: 0,
  pendingPayoutId: null,
  employer: null,
  aheadOfEmployer: false,
  proposalId: "p",
  employerId: "e",
  startDate: "2026-09-01",
  months: 3,
  monthlyShareMinor: 500_000,
  paidMonths: 0,
  pending: false,
  remainingMonths: 3,
  remainingMinor: 1_500_000,
  shortMinor: 0,
  nextDate: "2026-10-01",
  ...over,
});

test("ADP-02: total, paid, left, pending and the earliest next payment", () => {
  const m = internMoney(
    [due({}), due({ proposalId: "q", nextDate: "2026-09-15", remainingMinor: 200_000 }), due({ nextDate: null, remainingMinor: 0 })],
    { pendingMinor: 100_000, paidMinor: 400_000 },
  );
  assert.equal(m.totalMinor, 4_500_000);
  assert.equal(m.owedMinor, 1_700_000);
  assert.equal(m.paidMinor, 400_000);
  assert.equal(m.pendingPayoutMinor, 100_000);
  assert.equal(m.nextDate, "2026-09-15");
  assert.deepEqual(internMoney([]), { pendingPayoutMinor: 0, totalMinor: 0, paidMinor: 0, owedMinor: 0, nextDate: null });
});

// Same arithmetic as duesTotals() in payout-list.ts (total = totalShareMinor, due = remainingMinor),
// which is what Payouts > Employer dues shows; payout-list imports the DB so it cannot load here.
test("Candidates money equals the Payouts dues totals for the same rows", () => {
  const rows = [due({ totalShareMinor: 3_000_000, remainingMinor: 2_000_000, nextDate: "2026-11-01" }), due({ totalShareMinor: 600_000, remainingMinor: 0, nextDate: null })];
  const t = rows.reduce((a, d) => ({ total: a.total + d.totalShareMinor, due: a.due + d.remainingMinor }), { total: 0, due: 0 });
  const m = internMoney(rows);
  assert.equal(m.totalMinor, t.total);
  assert.equal(m.owedMinor, t.due);
  assert.equal(m.nextDate, "2026-11-01");
});

test("ADP-02: payout date filters follow the legacy windows", () => {
  const today = "2026-10-27";
  assert.equal(matchesDue("2026-10-20", "overdue", today), true);
  assert.equal(matchesDue("2026-10-27", "overdue", today), false);
  assert.equal(matchesDue("2026-11-03", "week", today), true);
  assert.equal(matchesDue("2026-11-04", "week", today), false);
  assert.equal(matchesDue("2026-11-27", "month", today), true);
  assert.equal(matchesDue("2026-11-28", "month", today), false);
  assert.equal(matchesDue("2026-10-20", "month", today), false);
  assert.equal(matchesDue(null, "none", today), true);
  assert.equal(matchesDue(null, "has", today), false);
});

test("today is the IST calendar day", () => {
  assert.equal(todayIstIso(new Date("2026-10-27T20:00:00Z")), "2026-10-28");
  assert.equal(todayIstIso(new Date("2026-10-27T10:00:00Z")), "2026-10-27");
});

test("no next date when nothing is owed (matches the dues tab)", () => {
  assert.equal(internMoney([due({ remainingMinor: 0, nextDate: "2026-12-14" })]).nextDate, null);
});
