import assert from "node:assert/strict";
import { test } from "node:test";

import { monthlyDues, paymentIndexMismatch, placementLedger } from "./dues.ts";
import { engagementEndOn, postpaidDueOn } from "./billing-plan.ts";

test("paymentIndexMismatch: a repeat submit for a paid month is refused, not re-priced", () => {
  assert.equal(paymentIndexMismatch([{ due: null }], 0), false); // first payment
  assert.equal(paymentIndexMismatch([{ due: { monthsPaid: 1 } }], 1), false); // month 2 asked, month 2 due
  assert.equal(paymentIndexMismatch([{ due: { monthsPaid: 2 } }], 1), true); // month 2 already paid
  assert.equal(paymentIndexMismatch([{ due: { monthsPaid: 1 } }], 0), true); // month 1 already paid
});

// Pay month 1, then a stale tab POSTs paymentIndex 0: after the first settles the plan is due month 2, so 0 is refused.
test("paymentIndexMismatch: month 1 paid, a stale submit for index 0 is refused", () => {
  assert.equal(paymentIndexMismatch([{ due: null }], 0), false); // before: month 1 is due
  assert.equal(paymentIndexMismatch([{ due: { monthsPaid: 1 } }], 0), true); // after: month 2 due
});

// The orders range ends on this day (placementLedger.endsOn), not on start + months.
test("last period end for a 2-month internship from 6 Nov is 5 Jan; month 2 is due from the employer on 4 Jan (intern paid 6 Jan)", () => {
  assert.equal(engagementEndOn("2026-11-06", 2), "2027-01-05");
  assert.equal(postpaidDueOn("2026-11-06", 2, 2), "2027-01-04");
});

// Orders row: month 1 was covered by the first (hiring-fee) order but a 100% promo waived it, so nothing was charged.
const waivedHire = { id: "p1", status: "hired", currency: "USD", hiredAt: "2026-11-20T10:00:00Z", offerDetails: { roleTitle: "Web", duration: "3m", monthlyAmount: 320, startDate: "2026-11-23", currency: "USD" } };
const firstOrder = (extra: Record<string, unknown> = {}) => ({
  status: "paid",
  paidAt: "2026-11-20T10:00:00Z",
  raw: { notes: { proposalIds: ["p1"], paymentMode: "hiring_fee", firstMonthProposalIds: ["p1"], ...extra }, promo: { promoCode: "FREE", discountMinor: 5000 + 32000 } },
});

test("placementLedger: a hire whose first month a promo waived is Partly paid at month 2, not 'No instalment paid'", () => {
  const l = placementLedger(waivedHire, [firstOrder()]);
  assert.equal(l.monthsPaid, 1);
  assert.equal(l.nextDue, "2027-01-21"); // month 2: start + 2 months - 2 days
  assert.equal(l.status, "partially_paid");
  assert.equal(l.dueMinor, 64000); // months 2 and 3 at $320
});

test("placementLedger: the next month comes from paid instalments, never from today's date", () => {
  const noFirstMonth = { status: "paid", paidAt: "2026-11-20T10:00:00Z", raw: { notes: { proposalIds: ["p1"], paymentMode: "hiring_fee" } } };
  const l = placementLedger(waivedHire, [noFirstMonth]);
  assert.deepEqual([l.monthsPaid, l.nextDue], [0, "2026-12-21"]); // fee only: month 1 is next
  assert.deepEqual(monthlyDues([waivedHire], [noFirstMonth]).map((d) => [d.monthsPaid, d.dueOn, d.payable]), [[0, "2026-12-21", true]]);
});
