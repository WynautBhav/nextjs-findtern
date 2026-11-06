/**
 * Offer statuses that block a new shortlist entry or a second offer: an
 * offer is out (sent, interview booked, accepted, being paid) or the
 * candidate is already hired. Pure, so the cart route, the candidate
 * relations and the tests share one list.
 */
export const LIVE_STATUSES = ["sent", "interview_scheduled", "accepted", "processing"];

/** Statuses the cart route refuses to shortlist against. */
export const OFFER_BLOCKING_STATUSES = [...LIVE_STATUSES, "hired"];

export function isLiveOffer(status: string | null | undefined): boolean {
  return OFFER_BLOCKING_STATUSES.includes((status ?? "").trim().toLowerCase());
}
