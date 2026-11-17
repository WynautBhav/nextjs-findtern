import assert from "node:assert/strict";
import { test } from "node:test";

import { publicOrder } from "./order-list.ts";

test("the orders list API returns money facts, not the payment signature or the raw gateway/buyer blob", () => {
  const out = publicOrder({
    id: "o1", employerId: "e1", gateway: "razorpay", orderId: "order_1", paymentId: "pay_1",
    signature: "deadbeefsignature", amountMinor: 1000, currency: "INR", status: "paid",
    raw: { buyer: { gstin: "29ABCDE1234F1Z5" }, refunds: [{ id: "r1", amountMinor: 100, status: "processed" }], needsReview: { reason: "not_all_hired" } },
    paidAt: new Date("2026-11-17T00:00:00Z"), invoiceNumber: "171126-01", createdAt: new Date("2026-11-16T00:00:00Z"), updatedAt: null,
  } as never);
  const text = JSON.stringify(out);
  assert.ok(!text.includes("deadbeefsignature"), "signature is not exposed");
  assert.ok(!text.includes("29ABCDE1234F1Z5"), "the raw buyer block is not exposed");
  assert.equal(out.orderId, "order_1");
  assert.equal(out.refundedMinor, 100);
  assert.equal(out.netMinor, 900);
  assert.equal(out.needsReview, true);
});
