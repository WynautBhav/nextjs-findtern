// Pure planners for the refunds scan and the Razorpay refund webhook. No DB, no HTTP.
import { buildRefundRow, eligibility, type WebhookEvent } from "./refunds.ts";

export interface ScanRow {
  paymentRowId: string;
  gateway: string;
  status: string;
  amountMinor: number;
  gatewayPaymentId: string | null;
  paidAt: Date | null;
  redeemedAt: Date;
  interviewStatus: string;
  failedAttempts: number;
  hasLiveRefund: boolean;
}

export interface PlannedRefund {
  row: ReturnType<typeof buildRefundRow>;
  status: "eligible" | "review";
  reason: string | null;
}

/** One planned refund per payment; a consumed interview on any entitlement sends it to review. */
export function planScan(rows: ScanRow[], actor: string, now = new Date()): PlannedRefund[] {
  const byPayment = new Map<string, PlannedRefund>();
  for (const r of rows) {
    const e = eligibility({
      payment: { id: r.paymentRowId, gateway: r.gateway, status: r.status, amountMinor: r.amountMinor, paymentId: r.gatewayPaymentId, paidAt: r.paidAt },
      entitlement: { redeemedAt: r.redeemedAt },
      existingRefunds: r.hasLiveRefund ? [{ internPaymentId: r.paymentRowId, status: "eligible" }] : [],
      now,
    });
    if (!e.eligible) continue;
    const consumed = r.interviewStatus !== "pending";
    const prev = byPayment.get(r.paymentRowId);
    if (prev && (prev.status === "review" || !consumed)) continue;
    byPayment.set(r.paymentRowId, {
      row: buildRefundRow({ id: r.paymentRowId, amountMinor: r.amountMinor }, actor, r.failedAttempts + 1),
      status: consumed ? "review" : "eligible",
      reason: consumed ? "interview_consumed" : "drive_entitlement_after_payment",
    });
  }
  return [...byPayment.values()];
}

export interface RazorpayRefundPayload {
  event?: string;
  payload?: { refund?: { entity?: { id?: string; receipt?: string | null; status?: string } } };
}

/** Maps a verified webhook body to a refund event, or null if it is not one we handle. */
export function parseRefundWebhook(body: RazorpayRefundPayload): (WebhookEvent & { receipt: string | null }) | null {
  if (body.event !== "refund.processed" && body.event !== "refund.failed") return null;
  const entity = body.payload?.refund?.entity;
  if (!entity?.id) return null;
  return { event: body.event, gatewayRefundId: entity.id, receipt: entity.receipt ?? null };
}
