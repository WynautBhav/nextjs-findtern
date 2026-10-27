import type { Tone } from "@/components/app/primitives";

/**
 * Where a candidate stands with this employer, in words (EMB-27). The card
 * used to print the raw enum ("Proposal interview_scheduled") and a plain
 * "Hired" with no internship / full-time split. Server-safe.
 */
export type CandidateProposal = { id: string; status: string; fullTime: boolean };

export function candidateStatusPill(proposal: CandidateProposal | null): { label: string; tone: Tone } | null {
  if (!proposal) return null;
  const kind = proposal.fullTime ? "Full-time offer" : "Proposal";
  switch (proposal.status.toLowerCase()) {
    case "hired":
      return { label: proposal.fullTime ? "Hired full-time" : "Hired as intern", tone: "live" };
    case "accepted":
      return { label: `${kind} accepted · payment due`, tone: "paid" };
    case "processing":
      return { label: "Payment in progress", tone: "waiting" };
    case "interview_scheduled":
      return { label: "Interview booked", tone: "new" };
    case "sent":
      return { label: `${kind} sent`, tone: "waiting" };
    default:
      return null;
  }
}

/** The label for the button that opens the existing offer. */
export function proposalActionLabel(proposal: CandidateProposal): string {
  if (proposal.status === "hired") return "View placement";
  if (proposal.status === "accepted") return "View accepted offer";
  return proposal.fullTime ? "View full-time offer" : "View sent proposal";
}
