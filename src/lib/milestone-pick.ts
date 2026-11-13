/**
 * The one note to show: the first in line (the list is already in priority order) that has not been dismissed.
 * Dependency-free on purpose: the client note imports this, and must not pull the journey code into the browser.
 */
export function currentMilestone<T extends { id: string }>(
  milestones: readonly T[],
  dismissed: ReadonlySet<string> | readonly string[],
): T | null {
  const gone = dismissed instanceof Set ? dismissed : new Set(dismissed);
  return milestones.find((m) => !gone.has(m.id)) ?? null;
}
