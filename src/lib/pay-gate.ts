import { cgpaBlocksPayment, proposalCgpaGate } from "./cgpa-verification.ts";
import { expiryOf } from "./proposal-expiry.ts";

/**
 * May the employer start paying for this offer right now? One answer for the checkout lines, the order route, promo
 * preview, the full-waiver path and the proposals UI, so they cannot disagree. Pure (no database).
 *
 * Order matters: an expired offer stays expired whatever the CGPA check says, so `expired` is answered first.
 * `processing` and `hired` rows are never gated (proposal-expiry.ts and the CGPA gate both leave them alone), and a
 * hired monthly placement paying its next month is therefore always payable.
 */

export type PayGateReason = "expired" | "cgpa_pending" | "cgpa_incorrect_unacked";
export type PayGate = { payable: boolean; reason: PayGateReason | null };

export type PayGateInput = {
  status: string | null;
  hiredAt: Date | string | null;
  offerDetails: unknown;
  /** The intern's `intern_onboarding.extra_data` (holds `cgpaVerification`); null/absent = never flagged. */
  extraData?: unknown;
  updatedAt?: Date | string | null;
  currency?: string | null;
  /** An unpaid employer order exists for this offer (the last 30 minutes). Freezes expiry, never lifts a CGPA block. */
  hasOpenOrder?: boolean;
};

export function payGateFor(p: PayGateInput, now: Date = new Date()): PayGate {
  if (expiryOf(p, now).expired) return { payable: false, reason: "expired" };
  const gate = proposalCgpaGate({ status: p.status ?? "", extraData: p.extraData, offerDetails: p.offerDetails, updatedAt: p.updatedAt }, now);
  if (!cgpaBlocksPayment(gate)) return { payable: true, reason: null };
  return { payable: false, reason: gate.state === "incorrect_unacked" ? "cgpa_incorrect_unacked" : "cgpa_pending" };
}

/** The `code` a refusing route answers with (HTTP 409), keyed by reason. */
export const PAY_GATE_CODE = {
  expired: "offer_expired",
  cgpa_pending: "cgpa_verification_pending",
  cgpa_incorrect_unacked: "cgpa_incorrect_unacked",
} as const satisfies Record<PayGateReason, string>;

export type PayGateCode = (typeof PAY_GATE_CODE)[PayGateReason];

/** Employer-facing copy. No candidate identity and no pay figures: this is shown on the employer side. */
export const PAY_GATE_MESSAGE: Record<PayGateReason, string> = {
  expired: "This offer expired because it was not paid before its start date. Send the candidate a new proposal.",
  cgpa_pending: "Findtern is still confirming the candidate's CGPA (usually 24-48 h). You can pay once it is confirmed.",
  cgpa_incorrect_unacked: "Findtern corrected the candidate's CGPA. Review the correction and press Confirm and continue before you pay.",
};

export type PayGateRefusal = { error: string; code: PayGateCode };

/** The 409 body for a gate that says no, or null when the offer is payable. */
export function payGateRefusal(gate: PayGate): PayGateRefusal | null {
  if (gate.payable || !gate.reason) return null;
  return { error: PAY_GATE_MESSAGE[gate.reason], code: PAY_GATE_CODE[gate.reason] };
}
