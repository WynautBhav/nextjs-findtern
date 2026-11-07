import test from "node:test";
import assert from "node:assert/strict";
import {
  applyWebhook, buildRefundRow, eligibility, initiateDecision, initiateRefundFlow,
  type RefundExecutor, type RefundLike,
} from "./refunds.ts";

const paidAt = new Date("2026-10-01T00:00:00Z");
const now = new Date("2026-11-07T00:00:00Z");
const pay = { id: "p1", gateway: "razorpay", status: "paid", amountMinor: 250000, paymentId: "pay_x", paidAt };
const ent = { redeemedAt: new Date("2026-11-01T00:00:00Z") };
const el = (over: object = {}, refunds: { internPaymentId: string; status: string }[] = []) =>
  eligibility({ payment: { ...pay, ...over }, entitlement: ent, existingRefunds: refunds, now });

test("eligibility matrix", () => {
  assert.deepEqual(el(), { eligible: true, amountMinor: 250000 });
  assert.equal(el({ gateway: "college_drive" }).eligible, false);
  assert.equal(el({ status: "created" }).eligible, false);
  assert.equal(el({ gateway: "paypal" }).eligible, false);
  assert.equal(el({ amountMinor: 0 }).eligible, false);
  assert.equal(el({ paidAt: new Date("2026-12-01") }).eligible, false);
  assert.equal(el({ paidAt: new Date("2025-01-01") }).eligible, false);
  assert.equal(el({}, [{ internPaymentId: "p1", status: "refunded" }]).eligible, false);
  assert.equal(el({}, [{ internPaymentId: "p1", status: "failed" }]).eligible, true);
});

test("amount is copied from payment", () => {
  const row = buildRefundRow(pay, "admin1");
  assert.equal(row.amountMinor, 250000);
  assert.equal(row.status, "eligible");
});

test("mismatched confirm refused", () => {
  const refund = { status: "eligible", amountMinor: 250000 };
  assert.equal(initiateDecision({ refund, confirm: true, amountMinor: 1 }).ok, false);
  assert.equal(initiateDecision({ refund, confirm: "true", amountMinor: 250000 }).ok, false);
  assert.equal(initiateDecision({ refund: { ...refund, status: "initiated" }, confirm: true, amountMinor: 250000 }).ok, false);
  assert.equal(initiateDecision({ refund, confirm: true, amountMinor: 250000 }).ok, true);
});

function fake(opts: { recordThrows?: boolean } = {}) {
  const row: RefundLike & { ambiguous?: boolean } = { id: "r1", internPaymentId: "p1", amountMinor: 250000, status: "eligible", idempotencyKey: "k" };
  let tail: Promise<void> = Promise.resolve();
  // Serialises transactions like a row lock; each tx() call is its own short transaction.
  const tx = async <T,>(fn: (e: RefundExecutor) => Promise<T>): Promise<T> => {
    const prev = tail;
    let release!: () => void;
    tail = new Promise<void>((r) => (release = r));
    await prev;
    try {
      const ex: RefundExecutor = {
        async lockRefund() { return { ...row }; },
        async getGatewayPaymentId() { return "pay_x"; },
        async claimInitiated() { if (["eligible", "review", "pending"].includes(row.status)) { row.status = "initiated"; return 1; } return 0; },
        async recordGatewayRefund(_i, g) { if (opts.recordThrows) throw new Error("db down"); row.gatewayRefundId = g; },
        async markFailed() { row.status = "failed"; },
        async markAmbiguous() { row.ambiguous = true; },
      };
      return await fn(ex);
    } finally {
      release();
    }
  };
  return { row, tx };
}
const input = { refundId: "r1", confirm: true, amountMinor: 250000 };

test("concurrent initiate calls gateway once", async () => {
  const { row, tx } = fake();
  let calls = 0;
  const gateway = { refund: async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return { id: "rfnd_1" }; } };
  const [a, b] = await Promise.all([initiateRefundFlow({ tx, gateway }, input), initiateRefundFlow({ tx, gateway }, input)]);
  assert.equal(calls, 1);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  assert.equal(row.gatewayRefundId, "rfnd_1");
});

test("a definite gateway refusal marks failed and leaves retry via a new row", async () => {
  const { row, tx } = fake();
  const gateway = { refund: async () => { throw Object.assign(new Error("boom rzp_live_abcdef123456"), { definite: true }); } };
  const r = await initiateRefundFlow({ tx, gateway }, input);
  assert.equal(!r.ok && r.reason, "gateway_error");
  assert.equal(row.status, "failed");
  assert.equal(el({}, [{ internPaymentId: "p1", status: row.status }]).eligible, true);
  assert.notEqual(buildRefundRow(pay, "a", 2).idempotencyKey, row.idempotencyKey);
});

test("an unknown gateway outcome keeps the row initiated so it can never be refunded twice", async () => {
  const { row, tx } = fake();
  const gateway = { refund: async () => { throw new Error("timeout"); } };
  const r = await initiateRefundFlow({ tx, gateway }, input);
  assert.equal(!r.ok && r.reason, "gateway_unknown");
  assert.equal(row.status, "initiated");
  assert.equal(row.ambiguous, true);
  const again = await initiateRefundFlow({ tx, gateway: { refund: async () => ({ id: "x" }) } }, input);
  assert.equal(!again.ok && again.httpStatus, 409);
});

test("refund made at the gateway but not recorded: row stays initiated for the webhook, caller sees success", async () => {
  const { row, tx } = fake({ recordThrows: true });
  const r = await initiateRefundFlow({ tx, gateway: { refund: async () => ({ id: "rfnd_9" }) } }, input);
  assert.equal(r.ok, true);
  assert.equal(row.status, "initiated");
});

test("webhook idempotence and ordering", () => {
  const ev = (event: "refund.processed" | "refund.failed") => ({ event, gatewayRefundId: "g" });
  assert.equal(applyWebhook({ status: "initiated" }, ev("refund.processed")), "refunded");
  assert.equal(applyWebhook({ status: "initiated" }, ev("refund.failed")), "failed");
  assert.equal(applyWebhook({ status: "refunded" }, ev("refund.processed")), null);
  assert.equal(applyWebhook({ status: "refunded" }, ev("refund.failed")), null);
  assert.equal(applyWebhook({ status: "eligible" }, ev("refund.processed")), null);
  assert.equal(applyWebhook({ status: "failed" }, ev("refund.processed")), null);
});
