import { createHmac, timingSafeEqual } from "node:crypto";

import { isTestHost } from "./origin.ts";

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

/** The `receipt` Razorpay stores and echoes for a refund created with this idempotency key. */
export function refundReceipt(idempotencyKey: string): string {
  return idempotencyKey.slice(0, 40);
}

/** Pure: the request createRefund sends. The idempotency key rides as `receipt` (Razorpay echoes it back). */
export function buildRefundRequest(input: { paymentId: string; amountMinor: number; idempotencyKey: string }) {
  if (!/^pay_[A-Za-z0-9]+$/.test(input.paymentId)) throw new Error("Invalid gateway payment id");
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("Invalid refund amount");
  return {
    path: `/v1/payments/${input.paymentId}/refund`,
    body: {
      amount: input.amountMinor,
      speed: "normal" as const,
      receipt: refundReceipt(input.idempotencyKey),
      notes: { idempotency_key: input.idempotencyKey.slice(0, 256) },
    },
  };
}

/** `definite` = Razorpay answered with a 4xx, so no refund exists. Anything else (timeout, network, 5xx) may have succeeded. */
export class RefundGatewayError extends Error {
  definite: boolean;
  constructor(message: string, definite: boolean) {
    super(message);
    this.definite = definite;
  }
}

const inflightRefunds = new Map<string, Promise<{ id: string; raw: Record<string, unknown> }>>();

/** Refunds part or all of a captured payment. Never throws a message containing keys. */
export function createRefund(input: { paymentId: string; amountMinor: number; idempotencyKey: string }) {
  const existing = inflightRefunds.get(input.idempotencyKey);
  if (existing) return existing; // local dedupe of concurrent calls with the same key
  const run = (async () => {
    const { keyId, keySecret } = keys();
    const req = buildRefundRequest(input);
    const res = await fetch(`https://api.razorpay.com${req.path}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: { description?: string } };
    if (!res.ok || !body.id) {
      throw new RefundGatewayError(`Razorpay refund failed (${res.status}): ${(body.error?.description ?? "no detail").slice(0, 120)}`, res.status >= 400 && res.status < 500);
    }
    return { id: body.id, raw: { id: body.id, status: body.status ?? null } };
  })().finally(() => inflightRefunds.delete(input.idempotencyKey));
  inflightRefunds.set(input.idempotencyKey, run);
  return run;
}

/**
 * Where reads go. api.razorpay.com, unless RAZORPAY_API_BASE names a loopback host and this is not production
 * (the e2e stub). A mis-set variable on the live site is ignored, so a read can never be pointed elsewhere.
 */
export function razorpayApiBase(env: Record<string, string | undefined> = process.env): string {
  const raw = (env.RAZORPAY_API_BASE ?? "").trim();
  if (!raw || env.VERCEL_ENV === "production") return "https://api.razorpay.com";
  try {
    const u = new URL(raw);
    if (u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) return u.origin;
  } catch {
    // fall through
  }
  return "https://api.razorpay.com";
}

/** A Razorpay refund entity, reduced to what the reconcile job reads. */
export interface GatewayRefundEntity {
  id: string;
  status: string;
  amountMinor: number | null;
  paymentId: string | null;
  receipt: string | null;
}

function toEntity(x: unknown): GatewayRefundEntity | null {
  const r = x as { id?: unknown; status?: unknown; amount?: unknown; payment_id?: unknown; receipt?: unknown } | null;
  if (!r || typeof r.id !== "string" || typeof r.status !== "string") return null;
  return {
    id: r.id,
    status: r.status,
    amountMinor: typeof r.amount === "number" ? r.amount : null,
    paymentId: typeof r.payment_id === "string" ? r.payment_id : null,
    receipt: typeof r.receipt === "string" ? r.receipt : null,
  };
}

/** GET against Razorpay. null = a 404 (the id does not exist). Anything else that is not a 2xx throws, with no keys in the message. */
async function gatewayGet(path: string): Promise<unknown | null> {
  const { keyId, keySecret } = keys();
  const res = await fetch(`${razorpayApiBase()}${path}`, {
    method: "GET",
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return null;
  const body = (await res.json().catch(() => ({}))) as { error?: { description?: string } };
  if (!res.ok) throw new Error(`Razorpay GET failed (${res.status}): ${(body.error?.description ?? "no detail").slice(0, 120)}`);
  return body;
}

/** Read-only. Never creates or changes anything at Razorpay. */
export async function fetchGatewayRefund(refundId: string): Promise<GatewayRefundEntity | null> {
  if (!/^rfnd_[A-Za-z0-9_]+$/.test(refundId)) throw new Error("Invalid gateway refund id");
  return toEntity(await gatewayGet(`/v1/refunds/${refundId}`));
}

/** Read-only. Refunds Razorpay holds for one payment (first page, up to 100). */
export async function listGatewayPaymentRefunds(paymentId: string): Promise<GatewayRefundEntity[]> {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new Error("Invalid gateway payment id");
  const body = (await gatewayGet(`/v1/payments/${paymentId}/refunds?count=100`)) as { items?: unknown[] } | null;
  return (body?.items ?? []).map(toEntity).filter((e): e is GatewayRefundEntity => e !== null);
}

/** True when the Razorpay key pair is present (the reconcile job refuses to run without it). */
export function razorpayConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean((env.RAZORPAY_KEY_ID ?? "").trim() && (env.RAZORPAY_KEY_SECRET ?? "").trim());
}
