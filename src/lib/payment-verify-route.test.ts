import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/**
 * The checkout callback (verify) routes, through the REAL handlers with the settle step, the guard and
 * the gateway lookup faked. Proves: a verified signature alone no longer settles when Razorpay says a
 * different amount was paid, and the amount Razorpay reports is what reaches settle.
 */
type Res = { status: number; body: Record<string, unknown> };
process.env.PAY_FAKE_RAZORPAY = "1";
register("./admin/test-support/payments-hooks.mjs", import.meta.url);

const fakes = (await import("./admin/test-support/payments-fakes.mjs")) as unknown as { reset: () => void };
const employer = (await import("../app/api/employer/[id]/payment/razorpay/verify/route.ts")) as unknown as { POST: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Res> };
const intern = (await import("../app/api/intern/[id]/payment/razorpay/verify/route.ts")) as unknown as { POST: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Res> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = () => (globalThis as any).__pay as { calls: { op: string; input: Record<string, unknown> }[]; gatewayPaid: unknown; [k: string]: unknown };

const body = { orderId: "order_1", paymentId: "pay_1", signature: "ok" };
const call = (r: typeof employer) => r.POST(new Request("https://example.test/x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "e1" }) });

for (const [name, route, op] of [["employer", employer, "employer"], ["intern", intern, "intern"]] as const) {
  test(`${name} verify: the amount Razorpay reports reaches settle`, async () => {
    fakes.reset();
    P().gatewayPaid = { amountMinor: 3_520_000, currency: "INR" };
    P().intern = { ok: true };
    const res = await call(route);
    assert.equal(res.status, 200);
    assert.deepEqual(P().calls.find((c) => c.op === op)!.input.paid, { amountMinor: 3_520_000, currency: "INR" });
  });

  test(`${name} verify: settle refusing the amount answers 409, not 200`, async () => {
    fakes.reset();
    P().gatewayPaid = { amountMinor: 1, currency: "INR" };
    P().intern = { ok: false, status: 409, code: "amount_mismatch", error: "The amount paid does not match this order" };
    P().employer = { ok: false, status: 409, code: "amount_mismatch", error: "The amount paid does not match this order" };
    const res = await call(route);
    assert.equal(res.status, 409);
    assert.match(String(res.body.error), /does not match/);
  });

  test(`${name} verify: Razorpay could not be asked (null): the verified signature alone settles, as before`, async () => {
    fakes.reset();
    P().gatewayPaid = null;
    P().intern = { ok: true };
    const res = await call(route);
    assert.equal(res.status, 200);
    assert.equal(P().calls.find((c) => c.op === op)!.input.paid, undefined);
  });

  test(`${name} verify: a bad signature settles nothing and never asks Razorpay`, async () => {
    fakes.reset();
    P().signatureOk = false;
    const res = await call(route);
    assert.equal(res.status, 400);
    assert.equal(P().calls.length, 0);
  });
}
