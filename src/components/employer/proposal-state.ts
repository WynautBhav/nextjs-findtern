import type { Tone } from "@/components/app/primitives";
// Relative .ts imports: the node tests run this file directly (no `@/` alias there).
import { cgpaBlocksPayment, type CgpaGate } from "../../lib/cgpa-verification.ts";
import { offerPastStart, type Offer } from "../../lib/offer.ts";
import { acceptedUnpaidExpired, EXPIRY_LABEL, type ExpiryReason } from "../../lib/proposal-expiry.ts";
import { closedReasonOf, proposalBucket, type ClosedReason, type ProposalBucket, type ProposalRow } from "./proposal-bucket.ts";

/**
 * One proposal, from the employer's side: the pill, the line on what happens
 * next, and which actions are open. Shared by the list and the detail page so
 * the two never disagree (they did: the list let you edit an offer the page
 * refused, and neither knew an interview-booked offer could be withdrawn).
 * Server-safe: no client directive.
 */
export type OfferState = {
  label: string;
  tone: Tone;
  next: string;
  /** Sent, unanswered, and its start date has passed (legacy: expired). */
  lapsed: boolean;
  /** Edit terms (internship offers, before payment; EMH-30). */
  canEdit: boolean;
  /** Withdraw (unpaid and live). Never an expired offer, stored or lapsed: it is already closed (withdrawRefusal). */
  canWithdraw: boolean;
  /** Accepted, payable now: the CGPA check is clear and the start day has not begun. */
  canPay: boolean;
  /** Where the one counter puts it (proposal-bucket.ts): the tab, the strip and the dashboard all read this. */
  bucket: ProposalBucket | null;
  /** Accepted, but Findtern is still confirming the candidate's CGPA (or a correction waits for the employer). Never payable. */
  verifying: boolean;
  /** The CGPA check, only when it blocks payment (pending, overdue, incorrect_unacked); null otherwise. */
  gate: CgpaGate | null;
  /** Why the offer expired, when it did (computed for an unpaid accepted offer or a lapsed one, stored for status `expired`). */
  expiredReason: ExpiryReason | null;
  /** Why a closed offer is closed (the Closed tab's sub-label); null when it is not closed. */
  closedReason: ClosedReason | null;
  /** An expired offer: the employer can start a new proposal to the same candidate and project. */
  canSendNew: boolean;
};

/** What `offerState` needs of a proposal row. `gate` is `proposalCgpaGate(...)` (the intern's extra_data is read by the loader, never here). */
export type OfferStateInput = {
  status: string;
  hiredAt: Date | string | null;
  offerDetails?: unknown;
  /** Whether an unpaid payment order is open: it freezes expiry (an order that settles hires). */
  hasOpenOrder?: boolean;
  gate?: CgpaGate | null;
};

const details = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const EXPIRED_NEXT: Record<ExpiryReason, string> = {
  unpaid_past_start: "The start date passed before this offer was paid, so it can no longer be paid. Send a new proposal to hire this candidate.",
  no_reply_past_start: "The start date passed without an answer. Send a new proposal to hire this candidate.",
  accepted_elsewhere: "The candidate accepted another offer from you, so this one closed.",
  admin_closed: "Findtern closed this offer. Write to us if you were not expecting that.",
  withdrawn: "You withdrew this offer.",
};

/** The one-line note a list card carries under an expired offer: why, not what to do (the button beside it says that). */
export const EXPIRED_CARD_NOTE: Partial<Record<ExpiryReason, string>> = {
  unpaid_past_start: "The candidate accepted, but the offer was not paid before its start date, so it can no longer be paid.",
  no_reply_past_start: "The candidate did not reply before the start date.",
};

export function offerState(p: OfferStateInput, offer: Pick<Offer, "startDate" | "fullTime">, now: Date = new Date()): OfferState {
  const status = (p.status ?? "").toLowerCase();
  const fullTime = Boolean(offer.fullTime);
  const lapsed = (status === "sent" || status === "interview_scheduled") && offerPastStart(offer.startDate, now);
  const unpaid = !p.hiredAt;

  // Expiry reason: a stored `expired` carries its own; an accepted, unpaid offer whose start day has begun (and has no
  // open order) is expired by computation; a lapsed unanswered one is "no reply".
  const stored = status === "expired" ? details(p.offerDetails).expiredReason : null;
  const expiredReason: ExpiryReason | null = lapsed
    ? "no_reply_past_start"
    : status === "expired"
      ? typeof stored === "string" && Object.hasOwn(EXPIRY_LABEL, stored)
        ? (stored as ExpiryReason)
        : "accepted_elsewhere"
      : acceptedUnpaidExpired({ status, hiredAt: p.hiredAt, offerDetails: { startDate: offer.startDate }, hasOpenOrder: p.hasOpenOrder }, now)
        ? "unpaid_past_start"
        : null;
  const unpaidExpired = expiredReason === "unpaid_past_start" && status === "accepted";
  const gate = status === "accepted" && !unpaidExpired && p.gate && cgpaBlocksPayment(p.gate) ? p.gate : null;
  const verifying = gate !== null;
  const flags = { verifying, expiredReason: unpaidExpired || status === "expired" ? expiredReason : null };
  const base = {
    lapsed,
    canEdit: false,
    canWithdraw: false,
    canPay: false,
    bucket: proposalBucket(status, lapsed, flags),
    verifying,
    gate,
    expiredReason,
    closedReason: closedReasonOf(status, lapsed, flags),
    canSendNew: expiredReason === "unpaid_past_start" || expiredReason === "no_reply_past_start",
  };

  if (lapsed) {
    return {
      ...base,
      label: EXPIRY_LABEL.no_reply_past_start,
      tone: "closed",
      next: EXPIRED_NEXT.no_reply_past_start,
    };
  }
  if (unpaidExpired) {
    // Never a Pay button and never a Withdraw: the offer is already expired.
    return { ...base, label: EXPIRY_LABEL.unpaid_past_start, tone: "closed", next: EXPIRED_NEXT.unpaid_past_start };
  }
  if (verifying && gate) {
    const corrected = gate.state === "incorrect_unacked";
    return {
      ...base,
      label: corrected ? "CGPA corrected · confirm" : "Accepted · not payable yet",
      tone: corrected ? "new" : "waiting",
      next:
        gate.state === "incorrect_unacked"
          ? gate.correctedFrom && gate.correctedTo
            ? `Findtern corrected the candidate's CGPA from ${gate.correctedFrom} to ${gate.correctedTo}. Confirm to continue to payment, or withdraw the proposal.`
            : "Findtern corrected the candidate's CGPA. Confirm to continue to payment, or withdraw the proposal."
          : "Accepted. Payment opens once Findtern's final checks are done (usually 24-48 h). We'll let you know when you can pay.",
      canEdit: !fullTime && unpaid,
      canWithdraw: unpaid,
    };
  }
  switch (status) {
    case "draft":
      return { ...base, label: "Draft", tone: "neutral", next: "Not sent yet.", canEdit: !fullTime, canWithdraw: true };
    case "sent":
      return {
        ...base,
        label: fullTime ? "Full-time offer sent" : "Waiting on candidate",
        tone: "waiting",
        next: fullTime
          ? "The candidate reads the offer letter and decides. You can withdraw it until they answer."
          : "The candidate reads the offer and decides before the start date. You can still edit or withdraw it.",
        canEdit: !fullTime,
        canWithdraw: true,
      };
    case "interview_scheduled":
      return {
        ...base,
        label: "Interview booked",
        tone: "waiting",
        next: "The candidate answers once the interview has happened. You can still edit or withdraw the offer.",
        canEdit: !fullTime,
        canWithdraw: true,
      };
    case "accepted":
      if (fullTime) {
        return { ...base, label: "Full-time accepted · fee due", tone: "paid", next: "The candidate accepted. Pay the hiring fee from checkout.", canPay: unpaid };
      }
      return {
        ...base,
        label: "Accepted · payment due",
        tone: "paid",
        next: "Pay for this hire to confirm it. Names and contact details unlock once your hire is paid. Until then you can still edit the offer (the candidate accepts it again) or withdraw it.",
        canEdit: unpaid,
        canWithdraw: unpaid,
        canPay: unpaid,
      };
    case "processing":
      return { ...base, label: "Payment in progress", tone: "waiting", next: "A payment is open for this hire. It settles in a few minutes." };
    case "hired":
      return {
        ...base,
        label: fullTime ? "Full-time hired" : "Hired",
        tone: "live",
        next: fullTime ? "Hired full-time." : "Paid and placed. Timesheets run monthly from the start date.",
      };
    case "rejected":
      return { ...base, label: "Declined", tone: "closed", next: "The candidate declined. Nothing more is needed from you." };
    case "withdrawn":
      return { ...base, label: "Withdrawn", tone: "closed", next: "You withdrew this offer." };
    case "expired":
      // "Closed · accepted elsewhere" fits a status pill; the full sentence is in `next`.
      return { ...base, label: expiredReason === "accepted_elsewhere" || expiredReason === null ? "Closed · accepted elsewhere" : EXPIRY_LABEL[expiredReason], tone: "closed", next: EXPIRED_NEXT[expiredReason ?? "accepted_elsewhere"] };
    default:
      return { ...base, label: status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ") : "Unknown", tone: "neutral", next: "" };
  }
}

/**
 * The row the one counter (proposal-bucket.ts) takes, from a proposal's status and its `offerState`. Every screen that
 * counts builds its rows here, so the tabs, the strip, the dashboard and checkout cannot disagree. The CGPA and expiry
 * keys are added only when they apply, so a proposal with neither has exactly the old shape.
 */
export function counterRow(status: string, s: OfferState, viewOnly = false): ProposalRow {
  return {
    status,
    lapsed: s.lapsed,
    ...(viewOnly ? { viewOnly: true } : {}),
    ...(s.verifying ? { verifying: true } : {}),
    ...(s.expiredReason ? { expiredReason: s.expiredReason } : {}),
  };
}

/**
 * The pill on its own, for screens that know a proposal's status but not its
 * offer terms (a candidate card, a profile's history): the same label and tone
 * `offerState` gives the list and the detail page, so one status reads one way.
 * Without the offer's start date it can't tell a lapsed offer: those read as
 * "Waiting on candidate" here and "Expired · no reply" on the proposals list.
 */
export function proposalPill(status: string | null, fullTime = false): { label: string; tone: Tone } {
  const { label, tone } = offerState(
    { status: status ?? "", hiredAt: null },
    { startDate: null, fullTime: fullTime ? ({} as Offer["fullTime"]) : null },
  );
  // No offer terms here, so no reason: a stored `expired` stays the short "Closed" on a candidate card.
  return { label: (status ?? "").toLowerCase() === "expired" ? "Closed" : label, tone };
}
