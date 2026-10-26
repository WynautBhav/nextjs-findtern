import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay over plain fetch: the app only creates orders and checks
 * signatures, which doesn't need the SDK.
 */

function keys() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured");
  return { keyId, keySecret };
}

export async function createOrder(input: {
  amountMinor: number;
  currency: string;
  receipt: string;
  notes?: Record<string, unknown>;
}): Promise<{ id: string; amount: number; currency: string }> {
  const { keyId, keySecret } = keys();
  // Razorpay notes are flat strings (max 15 keys, 256 chars each).
  const notes = Object.fromEntries(
    Object.entries(input.notes ?? {}).map(([k, v]) => [k, (typeof v === "string" ? v : JSON.stringify(v)).slice(0, 256)]),
  );
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: input.amountMinor, currency: input.currency, receipt: input.receipt.slice(0, 40), notes }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; amount?: number; currency?: string; error?: { description?: string } };
  if (!res.ok || !body.id) throw new Error(body.error?.description ?? `Razorpay order failed (${res.status})`);
  return { id: body.id, amount: body.amount ?? input.amountMinor, currency: body.currency ?? input.currency };
}

/**
 * Test mode (PAYMENTS_MODE=free): checkout and activation complete without
 * Razorpay and nothing is charged - for a staging copy with no gateway keys.
 * Off unless set explicitly; never set it on the live site.
 */
export function paymentsAreFree(): boolean {
  return (process.env.PAYMENTS_MODE ?? "").trim().toLowerCase() === "free";
}

export function razorpayKeyId(): string | undefined {
  return process.env.RAZORPAY_KEY_ID;
}

function hmacEquals(secret: string, payload: string, signature: string): boolean {
  const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Checkout callback signature: HMAC(order_id|payment_id) with the key secret. */
export function verifySignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  return Boolean(secret) && hmacEquals(secret!, `${orderId}|${paymentId}`, signature);
}

/** Webhook signature: HMAC(raw body) with the webhook secret. Never optional. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  return Boolean(secret && signature) && hmacEquals(secret!, rawBody, signature!);
}
