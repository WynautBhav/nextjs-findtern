// Pure refund rules + transactional initiate with an injected executor and gateway. No DB or HTTP here.

/** UNVERIFIED: Razorpay's refund window. Confirm against Razorpay docs before relying on it. */
export const GATEWAY_REFUND_WINDOW_DAYS = 180;
const DAY_MS = 86_400_000;

export type RefundStatus = "eligible" | "review" | "pending" | "initiated" | "refunded" | "failed";
export const INITIATABLE: readonly RefundStatus[] = ["eligible", "review", "pending"];

export interface PaymentLike {
  id: string;
  gateway: string;
  status: string;
  amountMinor: number;
  paymentId: string | null;
  paidAt: Date | null;
}
export interface EntitlementLike { redeemedAt: Date }
export interface RefundLike {
  id: string;
  internPaymentId: string;
  amountMinor: number;
  status: string;
  gatewayRefundId?: string | null;
  idempotencyKey: string;
}

export type Eligibility = { eligible: true; amountMinor: number } | { eligible: false; reason: string };

export function eligibility(input: {
  payment: PaymentLike;
  entitlement: EntitlementLike;
  existingRefunds: Pick<RefundLike, "internPaymentId" | "status">[];
  now?: Date;
}): Eligibility {
  const { payment, entitlement, existingRefunds } = input;
  const now = input.now ?? new Date();
  if (payment.gateway === "college_drive") return { eligible: false, reason: "waiver_row" };
  if (payment.gateway !== "razorpay") return { eligible: false, reason: "wrong_gateway" };
  if (payment.status !== "paid") return { eligible: false, reason: "not_paid" };
  if (!(payment.amountMinor > 0)) return { eligible: false, reason: "no_amount" };
  if (!payment.paymentId || !payment.paidAt) return { eligible: false, reason: "no_gateway_payment" };
  if (payment.paidAt.getTime() > entitlement.redeemedAt.getTime()) return { eligible: false, reason: "paid_after_redemption" };
  if (existingRefunds.some((r) => r.internPaymentId === payment.id && r.status !== "failed")) {
    return { eligible: false, reason: "refund_exists" };
  }
  if (now.getTime() - payment.paidAt.getTime() > GATEWAY_REFUND_WINDOW_DAYS * DAY_MS) {
    return { eligible: false, reason: "outside_refund_window" };
  }
  return { eligible: true, amountMinor: payment.amountMinor };
}

/** Amount comes from the payment only. attempt distinguishes a retry after a failed row. */
export function buildRefundRow(payment: Pick<PaymentLike, "id" | "amountMinor">, actor: string, attempt = 1) {
  return {
    internPaymentId: payment.id,
    amountMinor: payment.amountMinor,
    status: "eligible" as RefundStatus,
    idempotencyKey: `refund:${payment.id}:${attempt}`,
    actor,
  };
}

export type InitiateDecision = { ok: true } | { ok: false; reason: string };

export function initiateDecision(input: {
  refund: Pick<RefundLike, "status" | "amountMinor">;
  confirm: unknown;
  amountMinor: unknown;
}): InitiateDecision {
  if (input.confirm !== true) return { ok: false, reason: "confirm_required" };
  if (input.amountMinor !== input.refund.amountMinor) return { ok: false, reason: "amount_mismatch" };
  if (!INITIATABLE.includes(input.refund.status as RefundStatus)) return { ok: false, reason: "bad_status" };
  return { ok: true };
}

/** Phase-1 and phase-2 database steps. Each `RefundOps.tx` call is its own short transaction. */
export interface RefundExecutor {
  /** SELECT ... FROM payment_refunds WHERE id=$1 FOR UPDATE; null if missing. */
  lockRefund(id: string): Promise<RefundLike | null>;
  /** SELECT payment_id FROM intern_payments WHERE id=$1 (the gateway payment id). */
  getGatewayPaymentId(internPaymentId: string): Promise<string | null>;
  /** UPDATE payment_refunds SET status='initiated', initiated_at=now() WHERE id=$1 AND status IN ('eligible','review','pending'); returns rows affected. */
  claimInitiated(id: string): Promise<number>;
  /** UPDATE ... SET gateway_refund_id=$2, raw=$3 WHERE id=$1 AND status='initiated' */
  recordGatewayRefund(id: string, gatewayRefundId: string, raw: Record<string, unknown>): Promise<void>;
  /** UPDATE ... SET status='failed', raw=$2 WHERE id=$1 AND status='initiated'. Only for a definite refusal. */
  markFailed(id: string, raw: Record<string, unknown>): Promise<void>;
  /** UPDATE ... SET raw=$2 WHERE id=$1 AND status='initiated': the outcome at the gateway is unknown, the row stays initiated. */
  markAmbiguous(id: string, raw: Record<string, unknown>): Promise<void>;
}
export interface RefundGateway {
  refund(input: { paymentId: string; amountMinor: number; idempotencyKey: string }): Promise<{ id: string; raw?: Record<string, unknown> }>;
}
export interface RefundOps {
  tx<T>(fn: (e: RefundExecutor) => Promise<T>): Promise<T>;
  gateway: RefundGateway;
}

export type InitiateResult =
  | { ok: true; gatewayRefundId: string }
  | { ok: false; reason: string; httpStatus: 404 | 409 | 422 | 502 };

export function redactError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/(rzp_(?:live|test)_\w+|[A-Za-z0-9]{24,})/g, "[redacted]").slice(0, 200);
}

/**
 * Three steps, never one transaction around the network call:
 *  1. lock + claim -> 'initiated', committed. A second initiate now gets 409, so the gateway is called at most once.
 *  2. the gateway call, outside any transaction (no lock or connection is held while waiting on Razorpay).
 *  3. record the gateway id. A DB failure here leaves the row 'initiated' and the webhook settles it by receipt.
 * Only a definite 4xx marks the row failed. A timeout or 5xx may have refunded, so the row stays 'initiated'
 * (flagged) and the refund.processed / refund.failed webhook, or the Razorpay dashboard, decides it. Never auto-retry.
 */
export async function initiateRefundFlow(
  ops: RefundOps,
  input: { refundId: string; confirm: unknown; amountMinor: unknown },
): Promise<InitiateResult> {
  const claimed = await ops.tx(async (e): Promise<InitiateResult | { ok: "claimed"; refund: RefundLike; paymentId: string }> => {
    const refund = await e.lockRefund(input.refundId);
    if (!refund) return { ok: false, reason: "not_found", httpStatus: 404 };
    const d = initiateDecision({ refund, confirm: input.confirm, amountMinor: input.amountMinor });
    if (!d.ok) return { ok: false, reason: d.reason, httpStatus: d.reason === "bad_status" ? 409 : 422 };
    const paymentId = await e.getGatewayPaymentId(refund.internPaymentId);
    if (!paymentId) return { ok: false, reason: "no_gateway_payment", httpStatus: 422 };
    if ((await e.claimInitiated(refund.id)) === 0) return { ok: false, reason: "bad_status", httpStatus: 409 };
    return { ok: "claimed", refund, paymentId };
  });
  if (claimed.ok !== "claimed") return claimed;
  const { refund, paymentId } = claimed;

  let res: { id: string; raw?: Record<string, unknown> };
  try {
    res = await ops.gateway.refund({ paymentId, amountMinor: refund.amountMinor, idempotencyKey: refund.idempotencyKey });
  } catch (e) {
    const definite = (e as { definite?: boolean }).definite === true;
    const raw = { error: redactError(e), ...(definite ? {} : { ambiguous: true }) };
    await ops.tx((x) => (definite ? x.markFailed(refund.id, raw) : x.markAmbiguous(refund.id, raw)));
    return { ok: false, reason: definite ? "gateway_error" : "gateway_unknown", httpStatus: 502 };
  }
  try {
    await ops.tx((x) => x.recordGatewayRefund(refund.id, res.id, res.raw ?? {}));
  } catch (e) {
    console.error("[refunds] gateway refund made but not recorded; the webhook will settle it", refund.id, redactError(e));
  }
  return { ok: true, gatewayRefundId: res.id };
}

export type WebhookEvent = { event: "refund.processed" | "refund.failed"; gatewayRefundId: string };

/** Returns the new status, or null for a no-op. Only `initiated` moves; refunded/failed are terminal. */
export function applyWebhook(refund: Pick<RefundLike, "status">, e: WebhookEvent): "refunded" | "failed" | null {
  if (refund.status !== "initiated") return null;
  if (e.event === "refund.processed") return "refunded";
  if (e.event === "refund.failed") return "failed";
  return null;
}
