/**
 * Proposal statuses, in one place. Pure - safe for `node --test`.
 *
 * `accepted` means the candidate said yes; `hired` means the employer then
 * paid (see the employer verify route). Both are wins for pipeline metrics,
 * which is why counting only "accepted" understated every hire rate.
 */

export const PROPOSAL_STATUSES = [
  "draft",
  "sent",
  "interview_scheduled",
  "accepted",
  "hired",
  "rejected",
  "withdrawn",
  "expired",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export type ProposalOutcome = "won" | "lost" | "open";

export function proposalOutcome(status: string | null | undefined): ProposalOutcome {
  switch (status) {
    case "accepted":
    case "hired":
      return "won";
    case "rejected":
    case "withdrawn":
    case "expired":
      return "lost";
    default:
      return "open";
  }
}

/** Won share of decided proposals; null until something is decided. */
export function acceptanceRate(won: number, lost: number): number | null {
  return won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;
}
