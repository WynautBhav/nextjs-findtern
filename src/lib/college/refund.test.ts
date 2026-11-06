import { test } from "node:test";
import assert from "node:assert/strict";

import {
  REFUND_ERRORS,
  REFUND_STALE_MS,
  actionProblem,
  displayStatus,
  interviewTakenFrom,
  isGatewayPayment,
  lastFailedGatewayId,
  matchRefund,
  receiptFor,
  refundDecision,
  refundEventEntity,
  stalePending,
  statusFromGateway,
} from "./refund.ts";
import type { RazorpayRefund } from "../razorpay.ts";

const paid = { status: "paid", amountMinor: 249_900, gateway: "razorpay", paymentId: "pay_AbC123" };
const base = { payment: paid, usedCollegeCode: false, interviewTaken: false, existingRefund: null };
const ID = "6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b";

test("decision table: paid Razorpay activation, no interview, no code → eligible", () => {
  assert.deepEqual(refundDecision(base), { kind: "eligible" });
});

test("decision table: refusals and reviews", () => {
  assert.deepEqual(refundDecision({ ...base, payment: { ...paid, status: "created" } }), { kind: "none", error: REFUND_ERRORS.notPaid });
  assert.deepEqual(refundDecision({ ...base, payment: { ...paid, amountMinor: 0 } }), { kind: "none", error: REFUND_ERRORS.notPaid });
  assert.deepEqual(refundDecision({ ...base, usedCollegeCode: true }), { kind: "none", error: REFUND_ERRORS.usedCode });
  // Taken interview never refunds automatically, whatever the gateway.
  assert.deepEqual(refundDecision({ ...base, interviewTaken: true }), { kind: "requires_review", reason: "interview_taken" });
  for (const gateway of ["manual", "test", "free"]) {
    assert.deepEqual(refundDecision({ ...base, payment: { ...paid, gateway } }), { kind: "requires_review", reason: "not_gateway" });
  }
  assert.deepEqual(refundDecision({ ...base, payment: { ...paid, paymentId: "test_123" } }), { kind: "requires_review", reason: "not_gateway" });
});

test("decision: an open refund blocks a second; a rejected one does not", () => {
  for (const status of ["eligible", "requires_review", "pending", "initiated", "refunded", "failed"] as const) {
    assert.equal(refundDecision({ ...base, existingRefund: { status } }).kind, "none");
  }
  assert.equal(refundDecision({ ...base, existingRefund: { status: "rejected" } }).kind, "eligible");
});

test("amount is what was paid, never a constant", () => {
  // The decision carries no amount; the row copies intern_payments.amount_minor (₹2,499 = 249900 paise).
  assert.equal(refundDecision({ ...base, payment: { ...paid, amountMinor: 249_900 } }).kind, "eligible");
});

test("interview counts as taken once a link is out", () => {
  for (const s of ["completed", "sent", "scheduled"]) assert.equal(interviewTakenFrom(s), true, s);
  for (const s of ["not_applied", "applied", "expired", null, undefined]) assert.equal(interviewTakenFrom(s), false, String(s));
});

test("isGatewayPayment needs razorpay and a pay_ id", () => {
  assert.equal(isGatewayPayment(paid), true);
  assert.equal(isGatewayPayment({ gateway: "razorpay", paymentId: null }), false);
  assert.equal(isGatewayPayment({ gateway: "manual", paymentId: "pay_x1" }), false);
});

const now = new Date("2026-11-06T10:00:00Z");
const row = (status: string, extra: { gatewayRefundId?: string | null; ageMs?: number } = {}) => ({
  status: status as never,
  gatewayRefundId: extra.gatewayRefundId ?? null,
  updatedAt: new Date(now.getTime() - (extra.ageMs ?? 0)),
});

test("state machine: initiate only from eligible or failed", () => {
  assert.equal(actionProblem("initiate", row("eligible"), now), null);
  assert.equal(actionProblem("initiate", row("failed"), now), null);
  assert.equal(actionProblem("initiate", row("pending"), now), REFUND_ERRORS.inFlight);
  for (const s of ["requires_review", "initiated", "refunded", "rejected"]) assert.notEqual(actionProblem("initiate", row(s), now), null, s);
});

test("state machine: manual only from review; reject from open states; cancel only a stale pending", () => {
  assert.equal(actionProblem("mark_manual", row("requires_review"), now), null);
  assert.notEqual(actionProblem("mark_manual", row("eligible"), now), null);
  for (const s of ["eligible", "requires_review", "failed"]) assert.equal(actionProblem("reject", row(s), now), null, s);
  for (const s of ["pending", "initiated", "refunded", "rejected"]) assert.notEqual(actionProblem("reject", row(s), now), null, s);
  assert.equal(actionProblem("cancel", row("pending"), now), REFUND_ERRORS.inFlight);
  assert.equal(actionProblem("cancel", row("pending", { ageMs: REFUND_STALE_MS + 1 }), now), null);
  assert.notEqual(actionProblem("cancel", row("pending", { ageMs: REFUND_STALE_MS + 1, gatewayRefundId: "rfnd_1" }), now), null);
  assert.notEqual(actionProblem("cancel", row("initiated", { ageMs: REFUND_STALE_MS + 1 }), now), null);
});

test("stalePending: only pending, no gateway id, older than the call timeout", () => {
  assert.equal(stalePending(row("pending", { ageMs: REFUND_STALE_MS + 1 }), now), true);
  assert.equal(stalePending(row("pending", { ageMs: 1000 }), now), false);
  assert.equal(stalePending(row("pending", { ageMs: REFUND_STALE_MS + 1, gatewayRefundId: "rfnd_1" }), now), false);
  assert.equal(stalePending(row("failed", { ageMs: REFUND_STALE_MS + 1 }), now), false);
});

test("statusFromGateway: forward only, final states stay", () => {
  assert.equal(statusFromGateway("pending", "pending"), "initiated");
  assert.equal(statusFromGateway("pending", "processed"), "refunded");
  assert.equal(statusFromGateway("initiated", "processed"), "refunded");
  assert.equal(statusFromGateway("initiated", "failed"), "failed");
  assert.equal(statusFromGateway("initiated", "pending"), null);
  // A late success adopts a row a stale refresh had failed.
  assert.equal(statusFromGateway("failed", "processed"), "refunded");
  assert.equal(statusFromGateway("failed", "pending"), null);
  // Idempotent: a repeated webhook is a no-op.
  assert.equal(statusFromGateway("refunded", "processed"), null);
  assert.equal(statusFromGateway("refunded", "failed"), null);
  assert.equal(statusFromGateway("rejected", "processed"), null);
  assert.equal(statusFromGateway("eligible", "processed"), null);
  assert.equal(statusFromGateway("pending", "weird"), null);
});

const refund = (over: Partial<RazorpayRefund>): RazorpayRefund => ({ id: "rfnd_1", payment_id: "pay_AbC123", amount: 249_900, status: "pending", ...over });

test("matchRefund finds ours by notes.refund_id or receipt, not someone else's", () => {
  const items = [refund({ id: "rfnd_other", notes: { refund_id: "x" } }), refund({ id: "rfnd_ours", notes: { refund_id: ID } })];
  assert.equal(matchRefund(items, ID)?.id, "rfnd_ours");
  assert.equal(matchRefund([refund({ id: "rfnd_r", notes: [], receipt: receiptFor(ID, "rfnd_failed00001") })], ID)?.id, "rfnd_r");
  assert.equal(matchRefund([refund({ notes: [] })], ID), undefined);
});

test("receipts: stable per attempt, new after a gateway failure, ≤ 40 chars", () => {
  assert.equal(receiptFor(ID, null), ID);
  const retry = receiptFor(ID, "rfnd_FS8TWyPrCsa0OB");
  assert.notEqual(retry, ID);
  assert.equal(retry, receiptFor(ID, "rfnd_FS8TWyPrCsa0OB"));
  assert.ok(retry.length <= 40);
  assert.equal(lastFailedGatewayId({ gatewayResponse: { id: "rfnd_9", status: "failed" } }), "rfnd_9");
  assert.equal(lastFailedGatewayId({ gatewayResponse: { id: "rfnd_9", status: "processed" } }), null);
  assert.equal(lastFailedGatewayId({ gatewayResponse: null }), null);
});

test("displayStatus: the refund row wins, else the decision", () => {
  assert.equal(displayStatus({ refund: null, decision: { kind: "eligible" } }), "eligible");
  assert.equal(displayStatus({ refund: null, decision: { kind: "none", error: "x" } }), "none");
  assert.equal(displayStatus({ refund: { status: "initiated" } as never, decision: { kind: "eligible" } }), "initiated");
});

test("webhook: only signed refund.processed / refund.failed with a real refund entity are settled", () => {
  const entity = refund({ id: "rfnd_FS8TWyPrCsa0OB", status: "processed", notes: { refund_id: ID } });
  assert.equal(refundEventEntity({ event: "refund.processed", payload: { refund: { entity } } })?.id, "rfnd_FS8TWyPrCsa0OB");
  assert.equal(refundEventEntity({ event: "refund.failed", payload: { refund: { entity: { ...entity, status: "failed" } } } })?.status, "failed");
  // Other events stay with the payment handler or are ignored.
  assert.equal(refundEventEntity({ event: "refund.created", payload: { refund: { entity } } }), null);
  assert.equal(refundEventEntity({ event: "payment.captured", payload: { refund: { entity } } }), null);
  assert.equal(refundEventEntity({ event: "refund.processed", payload: {} }), null);
  assert.equal(refundEventEntity({ event: "refund.processed", payload: { refund: { entity: { ...entity, id: "pay_x" } } } }), null);
  assert.equal(refundEventEntity(null), null);
  // Replaying the same processed event changes nothing the second time.
  assert.equal(statusFromGateway("initiated", "processed"), "refunded");
  assert.equal(statusFromGateway("refunded", "processed"), null);
});
