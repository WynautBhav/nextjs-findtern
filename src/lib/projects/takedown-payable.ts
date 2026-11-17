// Pure part of the payable-lines exclusion (see employer-payable.ts): which accepted offers / due months an employer cannot
// pay for right now because their project is taken down. No database, so it is unit tested.

export const TAKEN_DOWN_PAY_NOTE = "Taken down: contact admin";

/**
 * Splits proposals into payable and blocked. With no taken-down project the input array itself comes back as `payable`
 * (same reference), so the money figures for projects that are not taken down cannot change.
 */
export function splitTakenDownProposals<T extends { projectId: string }>(
  proposals: T[],
  takenDownProjectIds: ReadonlySet<string>,
): { payable: T[]; blocked: T[] } {
  if (takenDownProjectIds.size === 0) return { payable: proposals, blocked: [] };
  const payable: T[] = [];
  const blocked: T[] = [];
  for (const x of proposals) (takenDownProjectIds.has(x.projectId) ? blocked : payable).push(x);
  return { payable, blocked };
}
