import { createHmac, timingSafeEqual } from "node:crypto";

import { isStagingOrigin } from "./origin.ts";

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
    // payment_capture: 1 asks Razorpay to capture the payment itself, as the legacy app did. Without it
    // the order follows the dashboard default: on "manual" a paid order stays authorized here, the app
    // marks the hire as paid, and Razorpay refunds the money days later.
    body: JSON.stringify({ amount: input.amountMinor, currency: input.currency, receipt: input.receipt.slice(0, 40), notes, payment_capture: 1 }),
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

/**
 * PAYMENTS_TEST_BUTTON=1 adds a "Test: mark as paid, no charge" button beside
 * Pay: the real amount, promo use and invoice number go through the real
 * settlement, only Razorpay is skipped. For a test database; never set it on
 * the live site. With a live Razorpay key it stays off unless this deployment
 * is positively identified as staging (PUBLIC_ORIGIN set to a host other than
 * findtern.in), so a leaked flag can't mark orders paid, or burn GST invoice
 * numbers, on the real domain, and an unset PUBLIC_ORIGIN fails closed.
 * REMOVE this switch, both buttons and the `testPay` order-route branches
 * before launch (docs/launch-2026-10-28.md).
 */
export function testPayEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if ((env.PAYMENTS_TEST_BUTTON ?? "").trim() !== "1") return false;
  if (!(env.RAZORPAY_KEY_ID ?? "").trim().startsWith("rzp_live_")) return true;
  return isStagingOrigin(env.PUBLIC_ORIGIN);
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
