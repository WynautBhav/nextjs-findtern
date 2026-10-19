import assert from "node:assert/strict";
import { test } from "node:test";

import { companyMoney } from "./company-money.ts";

test("last payment, upfront charge for an accepted offer, remaining monthly instalments", () => {
  const proposals = [
    { id: "a", employerId: "e1", internId: "i1", status: "accepted", currency: "INR", offerDetails: { monthlyAmount: 10000, duration: "2m", startDate: "2026-12-01" } },
    { id: "m", employerId: "e1", internId: "i2", status: "hired", currency: "USD", offerDetails: { monthlyAmount: 100, duration: "3m", startDate: "2026-09-15" } },
  ];
  const payments = [
    { employerId: "e1", status: "paid", amountMinor: 10_000, currency: "USD", paidAt: "2026-09-10T00:00:00Z", createdAt: null, raw: { notes: { paymentMode: "monthly", proposalIds: ["m"] } } },
    { employerId: "e1", status: "created", amountMinor: 999, currency: "INR", paidAt: null, createdAt: "2026-10-01T00:00:00Z", raw: {} },
  ];
  const m = companyMoney(["e1", "e2"], proposals, payments, () => 7).get("e1")!;
  assert.equal(m.lastPaymentInrMinor, 1_000_000);
  // accepted: ₹10,000 × 2 months − 10% upfront discount = ₹18,000; monthly: 2 × $100 → ₹20,000
  assert.equal(m.amountLeftInrMinor, 1_800_000 + 2_000_000);
  assert.equal(m.nextDueDate, "2026-10-15");
  assert.deepEqual(companyMoney(["e2"], proposals, payments, () => 7).get("e2"), {
    lastPaymentAt: null,
    lastPaymentInrMinor: null,
    nextDueDate: null,
    amountLeftInrMinor: 0,
  });
});
