import assert from "node:assert/strict";
import { test } from "node:test";

import { addMonthsIso, stipendDues } from "./stipend-dues.ts";

const hired = (id: string, offer: Record<string, unknown>) => ({ id, status: "hired", employerId: "e1", offerDetails: offer, currency: "INR" });

test("half the employer's monthly amount, next month after the paid ones", () => {
  const [d] = stipendDues(
    [hired("p1", { monthlyAmount: 20000, duration: "3m", startDate: "2026-01-31" })],
    [{ status: "paid", raw: { proposalId: "p1" } }, { status: "pending", raw: { proposalId: "other" } }],
    7.5,
  );
  assert.equal(d.monthlyShareMinor, 1_000_000);
  assert.equal(d.paidMonths, 1);
  assert.equal(d.remainingMonths, 2);
  assert.equal(d.remainingMinor, 2_000_000);
  assert.equal(d.nextDate, "2026-03-31");
  assert.equal(d.pending, false);
});

test("below score 6 the share is zero; full-time and unhired placements are left out", () => {
  const dues = stipendDues(
    [
      hired("p1", { monthlyAmount: 20000, duration: "2m", startDate: "2026-01-01" }),
      hired("ft", { fullTimeOffer: { annualCtc: 600000 } }),
      { ...hired("p2", { monthlyAmount: 1, duration: "1m" }), status: "accepted" },
    ],
    [],
    5,
  );
  assert.equal(dues.length, 1);
  assert.equal(dues[0].monthlyShareMinor, 0);
  assert.equal(dues[0].remainingMinor, 0);
});

test("fully paid placement has no next date", () => {
  const [d] = stipendDues([hired("p1", { monthlyAmount: 10000, duration: "1m", startDate: "2026-05-10" })], [{ status: "paid", raw: { proposalId: "p1" } }], 8);
  assert.equal(d.remainingMonths, 0);
  assert.equal(d.nextDate, null);
});

test("addMonthsIso clamps to month end", () => {
  assert.equal(addMonthsIso("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsIso("2026-11-15", 2), "2027-01-15");
  assert.equal(addMonthsIso(null, 1), null);
});
