import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { buildRefundRequest, createOrder, fetchGatewayRefund, listGatewayPaymentRefunds, razorpayApiBase, razorpayConfigured, refundReceipt } from "./razorpay.ts";

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

test("razorpayApiBase: the real host unless a loopback stub is named outside production", () => {
  const REAL = "https://api.razorpay.com";
  assert.equal(razorpayApiBase({}), REAL);
  assert.equal(razorpayApiBase({ RAZORPAY_API_BASE: "http://127.0.0.1:4346" }), "http://127.0.0.1:4346");
  assert.equal(razorpayApiBase({ RAZORPAY_API_BASE: "http://localhost:4346/x" }), "http://localhost:4346");
  assert.equal(razorpayApiBase({ RAZORPAY_API_BASE: "http://127.0.0.1:4346", VERCEL_ENV: "production" }), REAL, "ignored in production");
  assert.equal(razorpayApiBase({ RAZORPAY_API_BASE: "https://evil.example" }), REAL);
  assert.equal(razorpayApiBase({ RAZORPAY_API_BASE: "http://127.0.0.1.evil.example" }), REAL);
  assert.equal(razorpayApiBase({ RAZORPAY_API_BASE: "not a url" }), REAL);
});

test("refundReceipt matches what buildRefundRequest sends", () => {
  const key = `refund:${"p".repeat(60)}:1`;
  assert.equal(refundReceipt(key), key.slice(0, 40));
  assert.equal(buildRefundRequest({ paymentId: "pay_abc", amountMinor: 100, idempotencyKey: key }).body.receipt, refundReceipt(key));
});

test("razorpayConfigured needs both keys, non-blank", () => {
  assert.equal(razorpayConfigured({}), false);
  assert.equal(razorpayConfigured({ RAZORPAY_KEY_ID: "a", RAZORPAY_KEY_SECRET: " " }), false);
  assert.equal(razorpayConfigured({ RAZORPAY_KEY_ID: "a", RAZORPAY_KEY_SECRET: "b" }), true);
});

test("gateway reads: GET only, basic auth, 404 is null, errors carry no keys, odd ids refused before any call", async () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_idkey";
  process.env.RAZORPAY_KEY_SECRET = "topsecretvalue";
  const seen: { url: string; method?: string }[] = [];
  const reply = (status: number, body: unknown) => {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      seen.push({ url, method: init?.method });
      assert.ok(String((init?.headers as Record<string, string>).Authorization).startsWith("Basic "));
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
  };
  reply(200, { id: "rfnd_1", status: "processed", amount: 5000, payment_id: "pay_1", receipt: "r" });
  assert.deepEqual(await fetchGatewayRefund("rfnd_1"), { id: "rfnd_1", status: "processed", amountMinor: 5000, paymentId: "pay_1", receipt: "r" });
  reply(404, { error: { description: "nope" } });
  assert.equal(await fetchGatewayRefund("rfnd_2"), null);
  reply(502, { error: { description: "bad gateway rzp_test_idkey" } });
  await assert.rejects(fetchGatewayRefund("rfnd_3"), (e: Error) => /502/.test(e.message) && !e.message.includes("topsecretvalue"));
  reply(200, { items: [{ id: "rfnd_9", status: "pending", amount: 1 }, { nonsense: true }] });
  assert.deepEqual((await listGatewayPaymentRefunds("pay_1")).map((r) => r.id), ["rfnd_9"]);
  await assert.rejects(fetchGatewayRefund("rfnd_1/../../orders"));
  await assert.rejects(listGatewayPaymentRefunds("pay_1/refund"));
  assert.ok(seen.every((c) => c.method === "GET" && c.url.startsWith("https://api.razorpay.com/")));
  assert.equal(seen.length, 4);
});
