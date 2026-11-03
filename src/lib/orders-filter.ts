/** Client-side search for the employer Orders "Hires" and "Payment schedule" tabs. */

export type HireSearchable = { candidateName: string; projectName: string };

/**
 * Keep the hires whose candidate name or project name contains every
 * whitespace-separated word of `query` (case-insensitive). A blank query keeps all.
 */
export function filterHires<T extends HireSearchable>(hires: readonly T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...hires];
  return hires.filter((h) => {
    const hay = `${h.candidateName} ${h.projectName}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
