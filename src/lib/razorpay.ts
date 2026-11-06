import { createHmac, timingSafeEqual } from "node:crypto";

import { isTestHost } from "./origin.ts";

/**
 * Razorpay over plain fetch: the app creates orders and refunds and checks
 * signatures, which doesn't need the SDK.
 */

function keys() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured");
  return { keyId, keySecret };
}

/** API root. RAZORPAY_API_BASE points the refund calls at the e2e stub; ignored in production. */
export function razorpayApiBase(env: Record<string, string | undefined> = process.env): string {
  const override = (env.RAZORPAY_API_BASE ?? "").trim().replace(/\/+$/, "");
  return override && env.VERCEL_ENV !== "production" ? override : "https://api.razorpay.com";
}

function authHeader(): string {
  const { keyId, keySecret } = keys();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

/** Razorpay notes are flat strings (max 15 keys, 256 chars each). */
function flatNotes(notes: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(notes ?? {}).map(([k, v]) => [k, (typeof v === "string" ? v : JSON.stringify(v)).slice(0, 256)]),
  );
}

export async function createOrder(input: {
  amountMinor: number;
  currency: string;
  receipt: string;
  notes?: Record<string, unknown>;
}): Promise<{ id: string; amount: number; currency: string }> {
  const notes = flatNotes(input.notes);
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    // payment_capture: 1 asks Razorpay to capture the payment itself, as the legacy app did. Without it
    // the order follows the dashboard default: on "manual" a paid order stays authorized here, the app
    // marks the hire as paid, and Razorpay refunds the money days later.
    body: JSON.stringify({ amount: input.amountMinor, currency: input.currency, receipt: input.receipt.slice(0, 40), notes, payment_capture: 1 }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; amount?: number; currency?: string; error?: { description?: string } };
  if (!res.ok || !body.id) throw new Error(body.error?.description ?? `Razorpay order failed (${res.status})`);
  return { id: body.id, amount: body.amount ?? input.amountMinor, currency: body.currency ?? input.currency };
}

/** A refund as Razorpay returns it (docs: /api/refunds). `status`: pending | processed (final) | failed. */
export type RazorpayRefund = {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
  receipt?: string | null;
  notes?: Record<string, string> | unknown[];
  [key: string]: unknown;
};

/** A non-2xx answer from Razorpay: the request reached it and was refused. Network errors and timeouts throw plain Errors. */
export class RazorpayError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function refundCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${razorpayApiBase()}${path}`, {
    ...init,
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    // Long enough for Razorpay, short enough that "pending" older than REFUND_STALE_MS means the call is over.
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw new RazorpayError(body.error?.description ?? `Razorpay refund call failed (${res.status})`, res.status);
  return body;
}

/**
 * POST /v1/payments/{id}/refund. Razorpay has no idempotency header for refunds; it refuses a second refund
 * with the same `receipt` on the payment, and our dedupe is the refund row plus refresh-before-retry.
 */
export async function createRefund(paymentId: string, amountMinor: number, receipt: string, notes: Record<string, unknown>): Promise<RazorpayRefund> {
  return refundCall<RazorpayRefund>(`/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: JSON.stringify({ amount: amountMinor, speed: "normal", receipt: receipt.slice(0, 40), notes: flatNotes(notes) }),
  });
}

/** GET /v1/payments/{id}/refunds (the latest 100). */
export async function listRefunds(paymentId: string): Promise<RazorpayRefund[]> {
  const body = await refundCall<{ items?: RazorpayRefund[] }>(`/v1/payments/${encodeURIComponent(paymentId)}/refunds?count=100`);
  return Array.isArray(body.items) ? body.items : [];
}

/** GET /v1/refunds/{id}. */
export async function fetchRefund(refundId: string): Promise<RazorpayRefund> {
  return refundCall<RazorpayRefund>(`/v1/refunds/${encodeURIComponent(refundId)}`);
}

/**
 * Test mode (PAYMENTS_MODE=free): checkout and activation complete without
 * Razorpay and nothing is charged - for a staging copy with no gateway keys.
 * Off unless set explicitly; never set it on the live site. Like the test
 * button it refuses a live Razorpay key unless the deployment is positively
 * staging, so a leaked flag cannot mark every hire and activation as paid.
 */
export function paymentsAreFree(env: Record<string, string | undefined> = process.env): boolean {
  if ((env.PAYMENTS_MODE ?? "").trim().toLowerCase() !== "free") return false;
  return !hasLiveKey(env) || isTestHost(env);
}

function hasLiveKey(env: Record<string, string | undefined>): boolean {
  return (env.RAZORPAY_KEY_ID ?? "").trim().startsWith("rzp_live_");
}

/**
 * PAYMENTS_TEST_BUTTON=1 adds a "Test: mark as paid, no charge" button beside
 * Pay: the real amount, promo use and invoice number go through the real
 * settlement, only Razorpay is skipped. For a test database; never set it on
 * the live site. With a live Razorpay key it stays off unless this deployment
 * is a known test host (localhost, a *.vercel.app deployment, or a host listed in
 * STAGING_HOSTS), so a leaked flag can't mark orders paid, or burn GST invoice
 * numbers, on the real domain, and an unset PUBLIC_ORIGIN fails closed.
 * REMOVE this switch, both buttons and the `testPay` order-route branches
 * before launch (docs/launch-2026-10-28.md).
 */
export function testPayEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if ((env.PAYMENTS_TEST_BUTTON ?? "").trim() !== "1") return false;
  return !hasLiveKey(env) || isTestHost(env);
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
