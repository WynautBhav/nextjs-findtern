import assert from "node:assert/strict";
import { test } from "node:test";

import { monthlyDues, paymentIndexMismatch, paymentIndexRefusal, placementLedger } from "./dues.ts";
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

// A code that takes the whole price leaves nothing to pay: every month is covered, so the hire is Fully paid, not "No instalment paid".
const waiverOrder = (extra: Record<string, unknown>) => ({
  status: "paid",
  paidAt: "2026-11-20T10:00:00Z",
  raw: { notes: { proposalIds: ["p1"], ...extra }, promo: { promoCode: "FREE", discountMinor: 100_000_000 } },
});

test("placementLedger: a 3-month upfront hire waived in full is Fully paid at 3 of 3", () => {
  const l = placementLedger(waivedHire, [waiverOrder({ paymentMode: "total" })]);
  assert.deepEqual([l.totalMinor, l.paidMinor, l.dueMinor, l.monthsPaid, l.nextDue], [0, 0, 0, 3, null]);
  assert.equal(l.status, "fully_paid");
});

test("placementLedger: a 1-month post-paid hire waived in full is Fully paid", () => {
  const one = { ...waivedHire, offerDetails: { ...waivedHire.offerDetails, duration: "1m" } };
  const l = placementLedger(one, [waiverOrder({ paymentMode: "hiring_fee", firstMonthProposalIds: ["p1"] })]);
  assert.deepEqual([l.plan, l.dueMinor, l.monthsPaid], ["postpaid", 0, 1]);
  assert.equal(l.status, "fully_paid");
});

test("placementLedger: a hire nothing has paid yet is still unpaid", () => {
  assert.equal(placementLedger(waivedHire, []).status, "unpaid");
});

test("paymentIndexRefusal: a later month than the one due says an earlier month is due first; a paid month says already paid", () => {
  assert.equal(paymentIndexRefusal([{ due: { monthsPaid: 1 } }], 1), null);
  assert.match(paymentIndexRefusal([{ due: { monthsPaid: 1 } }], 2) ?? "", /earlier month is due first/);
  assert.match(paymentIndexRefusal([{ due: null }], 2) ?? "", /earlier month is due first/);
  assert.match(paymentIndexRefusal([{ due: { monthsPaid: 2 } }], 1) ?? "", /already paid/);
  assert.match(paymentIndexRefusal([{ due: { monthsPaid: 1 } }], 0) ?? "", /already paid/);
});

// Staging 23 Nov (Amazon, FREE-7EU4-2BRY-D6TU): $192 a month for 6 months, month 1 paid in full by a promo code.
// Orders must read Total $1,152 · Paid $192 (promo code) · Left $960, and show the $192 monthly payment.
test("placementLedger: a month a promo code paid shows as paid by that code, with the full price and the monthly amount", () => {
  const hire = { id: "6fc9", status: "hired", currency: "USD", hiredAt: "2026-11-23T12:36:34Z", offerDetails: { roleTitle: "Web Development", duration: "6m", monthlyAmount: 192, totalPrice: 1152, perHireCharge: 0, startDate: "2026-12-01", currency: "USD" } };
  const order = {
    status: "paid",
    paidAt: "2026-11-23T12:36:34Z",
    raw: {
      order: { id: "waiver_d331", amount: 0, currency: "USD", notes: { purpose: "employer_checkout", paymentMode: "hiring_fee", proposalIds: ["6fc9"], firstMonthProposalIds: ["6fc9"], perHireFeeMinor: { "6fc9": 0 }, listAmountMinor: 19200, computedAmountMinor: 0, discountAmountMinor: 19200 } },
      promo: { promoCode: "FREE-7EU4-2BRY-D6TU", fullWaiver: true, waivedMinor: 19200, discountMinor: 19200 },
    },
  };
  const l = placementLedger(hire, [order]);
  assert.equal(l.listMinor, 115200, "total before the code");
  assert.equal(l.monthlyMinor, 19200, "the monthly payment");
  assert.equal(l.promoMinor, 19200, "what the code paid");
  assert.equal(l.promoCode, "FREE-7EU4-2BRY-D6TU");
  assert.equal(l.dueMinor, 96000, "left to pay: five months");
  assert.equal(l.monthsPaid, 1);
  assert.equal(l.status, "partially_paid");
});
