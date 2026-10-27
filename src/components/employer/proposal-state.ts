import type { Tone } from "@/components/app/primitives";
import { offerPastStart, type Offer } from "@/lib/offer";

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
  /** Withdraw (unpaid; a lapsed offer too, so it stops holding the candidate: EMH-17). */
  canWithdraw: boolean;
  /** Accepted, waiting on payment. */
  canPay: boolean;
};

export function offerState(
  p: { status: string; hiredAt: Date | string | null },
  offer: Pick<Offer, "startDate" | "fullTime">,
  now: Date = new Date(),
): OfferState {
  const status = (p.status ?? "").toLowerCase();
  const fullTime = Boolean(offer.fullTime);
  const lapsed = (status === "sent" || status === "interview_scheduled") && offerPastStart(offer.startDate, now);
  const unpaid = !p.hiredAt;
  const base = { lapsed, canEdit: false, canWithdraw: false, canPay: false };

  if (lapsed) {
    return {
      ...base,
      label: "Expired · no reply",
      tone: "closed",
      next: "The start date passed without an answer. Withdraw it to free the candidate for a new offer.",
      canWithdraw: true,
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
        return { ...base, label: "Full-time hired", tone: "paid", next: "The candidate accepted. Pay the hiring fee from checkout.", canPay: unpaid };
      }
      return {
        ...base,
        label: "Accepted · payment due",
        tone: "paid",
        next: "Pay for this hire to confirm it. Names and contact details unlock on payment. Until then you can still edit the offer (the candidate accepts it again) or withdraw it.",
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
      return { ...base, label: "Closed", tone: "closed", next: "The candidate accepted another offer from you, so this one closed." };
    default:
      return { ...base, label: status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ") : "Unknown", tone: "neutral", next: "" };
  }
}
