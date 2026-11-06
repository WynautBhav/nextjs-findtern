import { FREE_DECLINES, offerPastStart, parseOffer } from "./offer.ts";

/**
 * Placement-guarantee eligibility (owner answers #7/#16, C5). One pure
 * function pair, used by the intern offer screens, the status route and the
 * admin pipeline flag so they can never disagree.
 *
 * A miss is an offer the intern turned down, or let lapse unanswered past its
 * start day. More than FREE_DECLINES misses (the 4th) end the guarantee.
 * Only a lapsed `sent` offer counts: an `interview_scheduled` one may be stuck
 * on the employer never holding the interview. A lapse is stamped
 * `offerDetails.lapsedAt` when the row later leaves `sent` (sibling auto-expiry,
 * withdraw) and still counts. Not counted: other withdrawals or
 * expiries, admin-set "rejected" (no `declinedBy: intern` stamp).
 *
 * Owner decisions (final): only internship offers count, so a declined or
 * lapsed full-time conversion offer (`offerDetails.fullTimeOffer`) is not a
 * miss; and an offer an ADMIN closed or expired (`offerDetails.closedByAdminAt`,
 * stamped by the status route) never counts, even if its start day had passed.
 * Offers admin-closed before that stamp existed cannot be told apart.
 */
export type GuaranteeProposal = { status: string | null; offerDetails: unknown; currency?: string | null };

export function guaranteeMisses(proposals: GuaranteeProposal[], now: Date = new Date()) {
  let declined = 0;
  let lapsed = 0;
  for (const p of proposals) {
    const status = (p.status ?? "").toLowerCase();
    const od = (p.offerDetails ?? {}) as Record<string, unknown>;
    if (typeof od.closedByAdminAt === "string") continue;
    if (parseOffer(p.offerDetails, p.currency).fullTime) continue;
    if (status === "rejected" && od.declinedBy === "intern") declined += 1;
    else if (
      typeof od.lapsedAt === "string" ||
      (status === "sent" && offerPastStart(parseOffer(p.offerDetails, p.currency).startDate, now))
    ) {
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

/**
 * The placement-guarantee window, in months from the AI interview. Owner set it
 * to 6 (Nov 2026; it was 12). It is stated in marketing, legal and chatbot copy
 * as plain text; `refund-window.test.ts` fails if an old window is reintroduced.
 */
export const GUARANTEE_MONTHS = 6;
