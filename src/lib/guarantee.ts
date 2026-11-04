import { FREE_DECLINES, offerPastStart, parseOffer } from "./offer.ts";

/**
 * Placement-guarantee eligibility (owner answers #7/#16, C5). One pure
 * function pair, used by the intern offer screens, the status route and the
 * admin pipeline flag so they can never disagree.
 *
 * A miss is an offer the intern turned down, or let lapse unanswered past its
 * start day. More than FREE_DECLINES misses (the 4th) end the guarantee.
 * Not counted: employer withdrawal, sibling auto-expiry, admin-set "expired"
 * or admin-set "rejected" (no `declinedBy: intern` stamp).
 * Derived on read: no scheduler, no stored expiry.
 */
export type GuaranteeProposal = { status: string | null; offerDetails: unknown; currency?: string | null };

export function guaranteeMisses(proposals: GuaranteeProposal[], now: Date = new Date()) {
  let declined = 0;
  let lapsed = 0;
  for (const p of proposals) {
    const status = (p.status ?? "").toLowerCase();
    if (status === "rejected") {
      if (((p.offerDetails ?? {}) as Record<string, unknown>).declinedBy === "intern") declined += 1;
    } else if ((status === "sent" || status === "interview_scheduled") && offerPastStart(parseOffer(p.offerDetails, p.currency).startDate, now)) {
      lapsed += 1;
    }
  }
  return { declined, lapsed, total: declined + lapsed };
}

/** True once the guarantee is lost: the ack stamp is set, or more than FREE_DECLINES misses. */
export function guaranteeEnded(extraData: unknown, misses: { total: number }): boolean {
  const stamp = ((extraData ?? {}) as Record<string, unknown>).guaranteeEndedAt;
  return typeof stamp === "string" || misses.total > FREE_DECLINES;
}
