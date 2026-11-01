import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createOrder } from "./razorpay.ts";

const realFetch = globalThis.fetch;
const env = { id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET };
afterEach(() => {
  globalThis.fetch = realFetch;
  if (env.id === undefined) delete process.env.RAZORPAY_KEY_ID;
  else process.env.RAZORPAY_KEY_ID = env.id;
  if (env.secret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
  else process.env.RAZORPAY_KEY_SECRET = env.secret;
});

test("an order asks Razorpay to capture the payment itself, like the legacy app", async () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "secret";
  let sent: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: "order_abc123", amount: 250000, currency: "INR" }), { status: 200 });
  }) as typeof fetch;

  const order = await createOrder({ amountMinor: 250000, currency: "INR", receipt: "employer_abcd1234_xyz", notes: { proposalIds: ["a", "b"] } });
  assert.equal(order.id, "order_abc123");
  assert.ok(sent, "a request was made");
  assert.equal((sent as Record<string, unknown>).payment_capture, 1);
  assert.equal((sent as Record<string, unknown>).amount, 250000);
  assert.equal((sent as Record<string, unknown>).currency, "INR");
});
