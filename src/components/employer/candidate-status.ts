import type { Tone } from "@/components/app/primitives";
import { proposalPill } from "@/components/employer/proposal-state";

/**
 * Where a candidate stands with this employer, in words (EMB-27). The label and
 * tone come from `proposal-state`, the one proposal vocabulary. Server-safe.
 */
export type CandidateProposal = { id: string; status: string; fullTime: boolean };

/** The newest expired offer to this candidate (employer-visibility `expired`): the card shows it instead of reading as never contacted. */
export type ExpiredProposal = { id: string; label: string };

export function candidateStatusPill(proposal: CandidateProposal | null, expired: ExpiredProposal | null = null): { label: string; tone: Tone } | null {
  if (!proposal) return expired ? { label: expired.label, tone: "closed" } : null;
  // Only the live relations get a pill on a candidate; a declined or withdrawn one leaves the card as it was.
  if (!["hired", "accepted", "processing", "interview_scheduled", "sent"].includes(proposal.status.toLowerCase())) return null;
  return proposalPill(proposal.status, proposal.fullTime);
}

/** The label for the button that opens the existing offer. */
export function proposalActionLabel(proposal: CandidateProposal): string {
  if (proposal.status === "hired") return "View placement";
  if (proposal.status === "accepted") return "View accepted offer";
  return proposal.fullTime ? "View full-time offer" : "View sent proposal";
}
