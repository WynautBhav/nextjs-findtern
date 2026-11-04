import assert from "node:assert/strict";
import { test } from "node:test";

import { paymentIndexMismatch } from "./dues.ts";
import { postpaidDueOn } from "./billing-plan.ts";

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
test("last period end for a 2-month internship from 6 Nov is 5 Jan", () => {
  assert.equal(postpaidDueOn("2026-11-06", 2, 2), "2027-01-05");
});
