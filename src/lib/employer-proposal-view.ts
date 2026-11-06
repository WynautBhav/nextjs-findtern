import type { Proposal } from "./db/schema.ts";

/** A proposal as an employer may see it: no intern pay (owner rule, 6 Nov 2026). */
export type EmployerProposal = Omit<Proposal, "completionBonusAt" | "completionBonusBy">;

export function toEmployerProposal(p: Proposal): EmployerProposal {
  const rest: Partial<Proposal> = { ...p };
  delete rest.completionBonusAt;
  delete rest.completionBonusBy;
  const offer: Record<string, unknown> = { ...((p.offerDetails ?? {}) as Record<string, unknown>) };
  delete offer.internStipendMonthly;
  return { ...(rest as EmployerProposal), offerDetails: offer };
}
