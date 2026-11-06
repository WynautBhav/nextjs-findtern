import type { Proposal } from "./db/schema.ts";

/** A proposal as an employer may see it: no intern pay (owner rule, 6 Nov 2026). */
export type EmployerProposal = Omit<Proposal, "completionBonusAt" | "completionBonusBy">;

export function toEmployerProposal(p: Proposal): EmployerProposal {
  const { completionBonusAt: _bonusAt, completionBonusBy: _bonusBy, ...rest } = p;
  const { internStipendMonthly: _stipend, ...offer } = (p.offerDetails ?? {}) as Record<string, unknown>;
  return { ...rest, offerDetails: offer };
}
