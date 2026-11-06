/** The Proposals tab an offer belongs to. One rule for the list and the dashboard, so their counts agree. */
export type ProposalBucket = "open" | "accepted" | "hired" | "closed";

/** `lapsed`: sent, unanswered, and past its start date (see offerState). */
export function proposalBucket(status: string, lapsed: boolean): ProposalBucket | null {
  if (lapsed) return "closed";
  if (status === "sent" || status === "interview_scheduled" || status === "draft") return "open";
  if (status === "accepted" || status === "processing") return "accepted";
  if (status === "hired") return "hired";
  if (status === "rejected" || status === "withdrawn" || status === "expired") return "closed";
  return null;
}
