import { isHiredProposal } from "./hire-status.ts";
import { payoutState, readScheduledForDate, type PayoutRow, type ProposalRow } from "./journey.ts";
import { internStipendInrMinor, parseOffer, stipendEligible } from "./offer.ts";

/**
 * Which stipend screen an intern sees. The empty "No stipend yet" scene is
 * only for someone with no engagement at all: a hired intern whose first
 * payout has not been recorded yet still has a rate and money to come, and
 * used to be told their stipend had not started.
 */
export function earningsView(payoutCount: number, hasEngagement: boolean): "empty" | "summary" {
  return payoutCount === 0 && !hasEngagement ? "empty" : "summary";
}

/** One hired internship on the stipend screen (legacy earnings.tsx card). */
export type EngagementEarnings = {
  proposalId: string;
  roleTitle: string;
  company: string;
  startDate: string | null;
  months: number;
  /** The intern's monthly stipend in INR paise; null when the offer has no amount. */
  monthlyMinor: number | null;
  /** False for a candidate scored below 6 (legacy: "Not eligible for stipend"). */
  eligible: boolean;
  paidMinor: number;
  /** Pending payouts recorded for this placement. */
  pendingMinor: number;
  failedMinor: number;
  /** Legacy "derived pending": the whole engagement at the intern's rate, less paid and pending. */
  remainingMinor: number;
  /** Earliest scheduled date of a pending payout. */
  nextPayoutAt: Date | null;
  hiredAt: Date | null;
};

type EarningsProposal = Pick<ProposalRow, "id" | "employerId" | "status" | "currency" | "offerDetails" | "hiredAt" | "createdAt">;

function payoutProposalId(p: PayoutRow): string {
  const raw = p.raw && typeof p.raw === "object" ? (p.raw as { proposalId?: unknown; proposal_id?: unknown }) : null;
  return String(raw?.proposalId ?? raw?.proposal_id ?? "").trim();
}

/**
 * One card per HIRED internship (INW-11 / INT-08): the company paid, so the
 * stipend is real. Accepted offers still waiting on payment (and legacy
 * "processing" ones) earn nothing yet and are left out, as are full-time
 * offers, whose salary the company pays directly.
 *
 * Payouts belong to a card through `raw.proposalId`, as legacy groups them.
 * A payout recorded without one is given to the only hire when there is
 * exactly one, so a single internship never shows "Paid: nothing" beside a
 * paid total.
 */
export function earningsEngagements(
  proposals: EarningsProposal[],
  payouts: PayoutRow[],
  names: Record<string, string>,
  score: number | null | undefined,
): EngagementEarnings[] {
  const hires = proposals
    .filter((p) => isHiredProposal(p) && !parseOffer(p.offerDetails, p.currency).fullTime)
    .sort((a, b) => (b.hiredAt ?? b.createdAt).getTime() - (a.hiredAt ?? a.createdAt).getTime());
  const soleId = hires.length === 1 ? hires[0].id : null;

  return hires.map((p) => {
    const offer = parseOffer(p.offerDetails, p.currency);
    const eligible = stipendEligible(score);
    const monthlyMinor = internStipendInrMinor(offer, score);
    const mine = payouts.filter((r) => {
      const pid = payoutProposalId(r);
      return pid ? pid === p.id : p.id === soleId;
    });
    let paidMinor = 0;
    let pendingMinor = 0;
    let failedMinor = 0;
    let nextPayoutAt: Date | null = null;
    for (const r of mine) {
      const amount = Math.max(0, r.amountMinor ?? 0);
      const state = payoutState(r.status);
      if (state === "paid") paidMinor += amount;
      else if (state === "failed") failedMinor += amount;
      else if (state === "pending") {
        pendingMinor += amount;
        const when = readScheduledForDate(r) ?? r.createdAt;
        if (!nextPayoutAt || when < nextPayoutAt) nextPayoutAt = when;
      }
    }
    const remainingMinor = monthlyMinor ? Math.max(0, monthlyMinor * offer.months - paidMinor - pendingMinor) : 0;
    return {
      proposalId: p.id,
      roleTitle: offer.roleTitle || "Internship",
      company: names[p.employerId] || "Your company",
      startDate: offer.startDate,
      months: offer.months,
      monthlyMinor,
      eligible,
      paidMinor,
      pendingMinor,
      failedMinor,
      remainingMinor,
      nextPayoutAt,
      hiredAt: p.hiredAt,
    };
  });
}
