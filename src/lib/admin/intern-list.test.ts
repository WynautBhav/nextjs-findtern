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
  nextDate: "2026-10-01",
  ...over,
});

test("ADP-02: owed, pending payout and the earliest next payment", () => {
  const m = internMoney(
    [due({}), due({ proposalId: "q", nextDate: "2026-09-15", remainingMinor: 200_000 }), due({ nextDate: null, remainingMinor: 0 })],
    [
      { status: "pending", amountMinor: 100_000, currency: "INR" },
      { status: "paid", amountMinor: 999_999, currency: "INR" },
    ],
  );
  assert.equal(m.owedMinor, 1_700_000);
  assert.equal(m.pendingPayoutMinor, 100_000);
  assert.equal(m.nextDate, "2026-09-15");
  assert.deepEqual(internMoney([], []), { pendingPayoutMinor: 0, owedMinor: 0, nextDate: null });
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
