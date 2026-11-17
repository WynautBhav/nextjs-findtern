import { offerPastStart } from "./offer.ts";

/**
 * When an offer stops being payable or answerable because its start date has begun (00:00 IST on that day, the same
 * moment unanswered offers lapse: offer.ts offerPastStart). Pure.
 *
 * Money rules, in order of importance:
 *  - `processing` and `hired` NEVER expire: the money is in flight or already settled.
 *  - An open payment order freezes expiry of an accepted offer: settlement hires only accepted|processing, so an
 *    offer that expired while its order was open would capture money with no hire.
 *  - Nothing here stamps `lapsedAt`: an employer letting an offer lapse unpaid is not a guarantee miss.
 *
 * Status `expired` already meant "the candidate accepted another offer" before this feature. A new expiry carries
 * `offerDetails.expiredReason`; a row with none is the legacy kind.
 */

export type ExpiryReason = "no_reply_past_start" | "unpaid_past_start" | "accepted_elsewhere" | "admin_closed" | "withdrawn";

export type ExpiryInput = {
  status: string | null;
  hiredAt: Date | string | null;
  offerDetails: unknown;
  currency?: string | null;
  /** An unpaid employer order exists for this offer (hasOpenOrderFor). Freezes expiry. */
  hasOpenOrder?: boolean;
};

export const EXPIRY_LABEL: Record<ExpiryReason, string> = {
  no_reply_past_start: "Expired · no reply before start",
  unpaid_past_start: "Expired · not paid before start",
  accepted_elsewhere: "Closed · candidate accepted another offer",
  admin_closed: "Closed by Findtern",
  withdrawn: "Withdrawn",
};

const REASONS = new Set<string>(Object.keys(EXPIRY_LABEL));
const NOT_EXPIRED = { expired: false, reason: null, at: null } as const;

const details = (offerDetails: unknown): Record<string, unknown> =>
  offerDetails && typeof offerDetails === "object" && !Array.isArray(offerDetails) ? (offerDetails as Record<string, unknown>) : {};

const startDayOf = (offerDetails: unknown): string => String(details(offerDetails).startDate ?? "").slice(0, 10);

/** The moment the start day begins in India, as an ISO instant. */
const startMoment = (day: string): string => new Date(`${day}T00:00:00+05:30`).toISOString();

/** Accepted, not hired, no open order, and the start day has begun: no longer payable. */
export function acceptedUnpaidExpired(p: ExpiryInput, now: Date = new Date()): boolean {
  return p.status === "accepted" && !p.hiredAt && !p.hasOpenOrder && offerPastStart(startDayOf(p.offerDetails), now);
}

/** Whether an offer is expired (stored or computed) and why. `at` is when: stored `expiredAt`, else the start-day boundary. */
export function expiryOf(p: ExpiryInput, now: Date = new Date()): { expired: boolean; reason: ExpiryReason | null; at: string | null } {
  if (p.hiredAt || p.status === "hired" || p.status === "processing") return { ...NOT_EXPIRED };

  if (p.status === "expired") {
    const d = details(p.offerDetails);
    const reason = typeof d.expiredReason === "string" && REASONS.has(d.expiredReason) ? (d.expiredReason as ExpiryReason) : "accepted_elsewhere";
    const at = typeof d.expiredAt === "string" && !Number.isNaN(Date.parse(d.expiredAt)) ? d.expiredAt : null;
    return { expired: true, reason, at };
  }

  const day = startDayOf(p.offerDetails);
  if (p.status === "accepted" && acceptedUnpaidExpired(p, now)) return { expired: true, reason: "unpaid_past_start", at: startMoment(day) };
  if ((p.status === "sent" || p.status === "interview_scheduled") && offerPastStart(day, now)) {
    return { expired: true, reason: "no_reply_past_start", at: startMoment(day) };
  }
  return { ...NOT_EXPIRED };
}

/** The offerDetails keys a new expiry writes (alongside status `expired`). Never `lapsedAt`. */
export function expiredStamp(reason: ExpiryReason, now: Date = new Date()): { expiredReason: ExpiryReason; expiredAt: string } {
  return { expiredReason: reason, expiredAt: now.toISOString() };
}
