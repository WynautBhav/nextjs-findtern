import type { Tone } from "@/components/app/primitives";
import { proposalPill } from "@/components/employer/proposal-state";

/**
 * Where a candidate stands with this employer, in words (EMB-27). The label and
 * tone come from `proposal-state`, the one proposal vocabulary. Server-safe.
 */
export type CandidateProposal = { id: string; status: string; fullTime: boolean };

export function candidateStatusPill(proposal: CandidateProposal | null): { label: string; tone: Tone } | null {
  if (!proposal) return null;
  // Only the live relations get a pill on a candidate; closed ones leave the card as it was.
  if (!["hired", "accepted", "processing", "interview_scheduled", "sent"].includes(proposal.status.toLowerCase())) return null;
  return proposalPill(proposal.status, proposal.fullTime);
}

/** The label for the button that opens the existing offer. */
export function proposalActionLabel(proposal: CandidateProposal): string {
  if (proposal.status === "hired") return "View placement";
  if (proposal.status === "accepted") return "View accepted offer";
  return proposal.fullTime ? "View full-time offer" : "View sent proposal";
}
