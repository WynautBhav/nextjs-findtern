/** Client-side search shared by the employer Orders tabs (Hires, Payment schedule, Invoices). */

export type HireSearchable = { candidateName: string; projectName: string; roleTitle?: string };

/** The loader's stand-in for a hire with no project name; never searchable. */
const PROJECT_PLACEHOLDER = "Project";

/** Lowercase, accent-folded text: "José" -> "jose". */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * True when every whitespace-separated word of `query` appears in at least
 * one of `fields` (both sides case- and accent-insensitive). A blank query matches.
 */
export function matchesQuery(query: string, fields: readonly (string | null | undefined)[]): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = normalizeSearch(fields.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}

/** Keep the hires whose candidate, project or role matches every word of `query`. */
export function filterHires<T extends HireSearchable>(hires: readonly T[], query: string): T[] {
  return hires.filter((h) =>
    matchesQuery(query, [h.candidateName, h.projectName === PROJECT_PLACEHOLDER ? "" : h.projectName, h.roleTitle]),
  );
}
