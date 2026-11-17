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

/**
 * College order (a Findtern Pro sort): `sort=college` is A-Z, `sort=college_desc` Z-A. It rides in the same
 * `sort` parameter as the score fields, which ignore it, so an old link keeps working.
 */
export type CollegeSort = "asc" | "desc";

export function parseCollegeSort(raw: string | string[] | undefined): CollegeSort | null {
  const parts = (Array.isArray(raw) ? raw : [raw ?? ""]).flatMap((v) => v.split(",")).map((p) => p.trim());
  for (const part of parts) {
    if (part === "college") return "asc";
    if (part === "college_desc") return "desc";
  }
  return null;
}

export const collegeSortToken = (sort: CollegeSort | null): string => (sort === "asc" ? "college" : sort === "desc" ? "college_desc" : "");

/** Take the college tokens out of a `sort` value, keeping the rest in order (for a free employer, who has none). */
export function withoutCollegeSort(raw: string): string {
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && p !== "college" && p !== "college_desc")
    .join(",");
}

const foldCollege = (name: string) => name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Stable college sort: A-Z or Z-A, a candidate with no college last either way, ties keep their incoming order
 * (so the score fields chosen next to it still break them). Does not change `list`.
 */
export function sortByCollege<T>(list: readonly T[], collegeOf: (item: T) => string | null, dir: CollegeSort): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const x = collegeOf(a);
    const y = collegeOf(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return sign * foldCollege(x).localeCompare(foldCollege(y), "en");
  });
}
