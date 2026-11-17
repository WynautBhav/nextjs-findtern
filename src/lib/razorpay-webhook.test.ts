import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { register } from "node:module";
import test from "node:test";

/**
 * The Razorpay webhook, traced through the REAL route handler with the settle functions faked
 * (test-support/payments-fakes.mjs). Proves: the signature gate, that the amount and currency
 * Razorpay reports reach the settle step, that a refused amount is acknowledged (so Razorpay
 * stops retrying) but never reported as settled. The SQL inside settle is covered by the
 * browser/real-DB pass in the audit report.
 */
type Res = { status: number; body: Record<string, unknown> };
register("./admin/test-support/payments-hooks.mjs", import.meta.url);
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_only";

const fakes = (await import("./admin/test-support/payments-fakes.mjs")) as unknown as { reset: () => void };
const route = (await import("../app/api/webhooks/razorpay/route.ts")) as unknown as { POST: (r: Request) => Promise<Res> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = () => (globalThis as any).__pay as { calls: { op: string; input: Record<string, unknown> }[]; [k: string]: unknown };

const sign = (body: string) => createHmac("sha256", "whsec_test_only").update(body).digest("hex");
const post = (payload: unknown, signature?: string | null) => {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {};
  if (signature !== null) headers["x-razorpay-signature"] = signature ?? sign(body);
  return route.POST(new Request("https://example.test/api/webhooks/razorpay", { method: "POST", body, headers }));
};
const captured = (extra: Record<string, unknown> = {}) => ({
  event: "payment.captured",
  payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 3_520_000, currency: "INR", status: "captured", ...extra } } },
});

test("an unsigned or wrongly signed event is refused and settles nothing", async () => {
  fakes.reset();
  assert.equal((await post(captured(), null)).status, 400);
  assert.equal((await post(captured(), "deadbeef")).status, 400);
  assert.equal(P().calls.length, 0);
});

test("the amount and currency Razorpay reports are handed to settle, in minor units", async () => {
  fakes.reset();
  const res = await post(captured());
  assert.equal(res.status, 200);
  const call = P().calls.find((c) => c.op === "employer")!;
  assert.deepEqual(call.input, { orderId: "order_1", paymentId: "pay_1", paid: { amountMinor: 3_520_000, currency: "INR" } });
});

test("order.paid carries the payment entity too: same amount check", async () => {
  fakes.reset();
  await post({ event: "order.paid", payload: { order: { entity: { id: "order_1", amount: 3_520_000, amount_paid: 3_520_000 } }, payment: { entity: { id: "pay_1", order_id: "order_1", amount: 100, currency: "INR" } } } });
  assert.deepEqual(P().calls.find((c) => c.op === "employer")!.input.paid, { amountMinor: 100, currency: "INR" });
});

test("a refused amount is acknowledged with 200 (a retry cannot fix it) and reported as refused, not ok", async () => {
  fakes.reset();
  P().employer = { ok: false, status: 409, code: "amount_mismatch", error: "Amount mismatch" };
  const res = await post(captured({ amount: 100 }));
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "refused");
});

test("an intern activation order is tried first and the employer path is skipped when it settles", async () => {
  fakes.reset();
  P().intern = { ok: true };
  await post(captured());
  assert.deepEqual(P().calls.map((c) => c.op), ["intern"]);
});

test("a refused intern amount is acknowledged and does not fall through to the employer path", async () => {
  fakes.reset();
  P().intern = { ok: false, status: 409, code: "amount_mismatch", error: "Amount mismatch" };
  const res = await post(captured({ amount: 5 }));
  assert.equal(res.body.status, "refused");
  assert.deepEqual(P().calls.map((c) => c.op), ["intern"]);
});

test("a settle that throws answers 500 so Razorpay retries", async () => {
  fakes.reset();
  P().settleThrows = true;
  assert.equal((await post(captured())).status, 500);
});

test("events that are not payments are ignored; a payment event with no ids is ignored", async () => {
  fakes.reset();
  assert.equal((await post({ event: "payment.failed", payload: {} })).body.status, "ignored");
  assert.equal((await post({ event: "payment.captured", payload: { payment: { entity: {} } } })).body.status, "ignored");
  assert.equal(P().calls.length, 0);
});

test("refund events go to the refund settler, never to the order settlers", async () => {
  fakes.reset();
  const res = await post({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 100, status: "processed" } } } });
  assert.equal(res.status, 200);
  assert.deepEqual(P().calls.map((c) => c.op), ["refund"]);
});

test("a payment for an order we have no record of is acknowledged but reported as unknown, never as ok", async () => {
  fakes.reset();
  P().intern = { ok: false, status: 404, error: "Unknown order" };
  P().employer = { ok: false, status: 404, error: "Unknown order" };
  const res = await post(captured());
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "unknown_order");
});
