import test from "node:test";
import assert from "node:assert/strict";
import { parseRefundWebhook, planScan, type ScanRow } from "./refunds-plan.ts";
import { applyWebhook, initiateDecision } from "./refunds.ts";
import { buildRefundRequest } from "../razorpay.ts";

const now = new Date("2026-11-07T00:00:00Z");
const base: ScanRow = {
  paymentRowId: "p1", gateway: "razorpay", status: "paid", amountMinor: 100000, gatewayPaymentId: "pay_A1",
  paidAt: new Date("2026-10-01T00:00:00Z"), redeemedAt: new Date("2026-11-01T00:00:00Z"),
  interviewStatus: "pending", failedAttempts: 0, hasLiveRefund: false,
};

test("scan: eligible, waiver and after-entitlement excluded, consumed -> review", () => {
  const plan = planScan([
    base,
    { ...base, paymentRowId: "w", gateway: "college_drive", amountMinor: 0 },
    { ...base, paymentRowId: "late", paidAt: new Date("2026-11-02T00:00:00Z") },
    { ...base, paymentRowId: "used", interviewStatus: "completed" },
    { ...base, paymentRowId: "done", hasLiveRefund: true },
    { ...base, paymentRowId: "retry", failedAttempts: 1 },
  ], "admin", now);
  assert.deepEqual(plan.map((p) => [p.row.internPaymentId, p.status]), [["p1", "eligible"], ["used", "review"], ["retry", "eligible"]]);
  assert.equal(plan[2].row.idempotencyKey, "refund:retry:2");
});

test("scan: two entitlements, one consumed -> single review row", () => {
  const plan = planScan([base, { ...base, interviewStatus: "done" }, base], "a", now);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].status, "review");
});

test("amount-equality guard", () => {
  const refund = { status: "eligible", amountMinor: 100000 };
  assert.equal(initiateDecision({ refund, confirm: true, amountMinor: 100000 }).ok, true);
  assert.deepEqual(initiateDecision({ refund, confirm: true, amountMinor: 99999 }), { ok: false, reason: "amount_mismatch" });
  assert.deepEqual(initiateDecision({ refund, confirm: true, amountMinor: "100000" }), { ok: false, reason: "amount_mismatch" });
  assert.equal(initiateDecision({ refund, confirm: false, amountMinor: 100000 }).ok, false);
});

test("webhook mapping: processed, failed, replay, out of order, unknown", () => {
  const body = (event: string, id = "rfnd_1") => ({ event, payload: { refund: { entity: { id, receipt: "refund:p1:1" } } } });
  const ok = parseRefundWebhook(body("refund.processed"))!;
  assert.equal(ok.gatewayRefundId, "rfnd_1");
  assert.equal(applyWebhook({ status: "initiated" }, ok), "refunded");
  assert.equal(applyWebhook({ status: "refunded" }, ok), null); // replay
  const failed = parseRefundWebhook(body("refund.failed"))!;
  assert.equal(applyWebhook({ status: "initiated" }, failed), "failed");
  assert.equal(applyWebhook({ status: "refunded" }, failed), null); // out of order
  assert.equal(applyWebhook({ status: "failed" }, ok), null);
  assert.equal(parseRefundWebhook(body("payment.captured")), null);
  assert.equal(parseRefundWebhook({ event: "refund.processed", payload: {} }), null);
});

test("razorpay refund request builder", () => {
  const r = buildRefundRequest({ paymentId: "pay_A1", amountMinor: 100000, idempotencyKey: "refund:p1:1" });
  assert.equal(r.path, "/v1/payments/pay_A1/refund");
  assert.deepEqual(r.body, { amount: 100000, speed: "normal", receipt: "refund:p1:1", notes: { idempotency_key: "refund:p1:1" } });
  assert.throws(() => buildRefundRequest({ paymentId: "../x", amountMinor: 1, idempotencyKey: "k" }));
  assert.throws(() => buildRefundRequest({ paymentId: "pay_A1", amountMinor: 0, idempotencyKey: "k" }));
  assert.ok(!JSON.stringify(r).includes("Basic"));
});
