/**
 * Multi-field sort for the employer candidates page, ported from the legacy
 * dashboard (employer-dashboard.tsx `bySortFields`): compare on each chosen
 * field in turn, one direction for all of them. Pure so it can be tested.
 */
export type SortField = "score" | "communication" | "coding" | "aptitude" | "interview";

export const SORT_FIELDS: readonly SortField[] = ["score", "communication", "coding", "aptitude", "interview"];
export const MAX_SORT_FIELDS = 3;

type Sortable = { score: number; ratings: Record<Exclude<SortField, "score">, number> };

/** Distinct valid fields from `sort=a,b` or repeated `sort=a&sort=b`, in order, at most three. */
export function parseSortFields(raw: string | string[] | undefined): SortField[] {
  const parts = (Array.isArray(raw) ? raw : [raw ?? ""]).flatMap((v) => v.split(","));
  const out: SortField[] = [];
  for (const part of parts) {
    const key = part.trim() as SortField;
    if (SORT_FIELDS.includes(key) && !out.includes(key)) out.push(key);
  }
  return out.slice(0, MAX_SORT_FIELDS);
}

/** Negative when `a` ranks first. Falls back to the Findtern Score (desc) when no field is chosen. */
export function compareBySortFields(a: Sortable, b: Sortable, fields: readonly SortField[], dir: "asc" | "desc"): number {
  const value = (c: Sortable, f: SortField) => (f === "score" ? c.score : (c.ratings[f] ?? 0));
  const sign = dir === "asc" ? -1 : 1;
  for (const f of fields.length > 0 ? fields : (["score"] as const)) {
    const diff = value(b, f) - value(a, f);
    if (diff !== 0) return sign * diff;
  }
  return 0;
}
