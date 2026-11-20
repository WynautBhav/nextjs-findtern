/**
 * Multi-field sort for the employer candidates page, ported from the legacy
 * dashboard (employer-dashboard.tsx `bySortFields`): compare on each chosen
 * field in turn, one direction for all of them. Pure so it can be tested.
 */
export type SortField = "score" | "communication" | "coding" | "aptitude" | "interview";

export const SORT_FIELDS: readonly SortField[] = ["score", "communication", "coding", "aptitude", "interview"];
export const MAX_SORT_FIELDS = 3;

type Sortable = { score: number; scored?: boolean; ratings: Record<Exclude<SortField, "score">, number> };

export type SortDir = "asc" | "desc";

/**
 * Distinct valid fields from `sort=a,b` or repeated `sort=a&sort=b`, in order, at most three.
 */
export function parseSortFields(raw: string | string[] | undefined): SortField[] {
  const parts = (Array.isArray(raw) ? raw : [raw ?? ""]).flatMap((v) => v.split(","));
  const out: SortField[] = [];
  for (const part of parts) {
    const key = part.trim() as SortField;
    if (SORT_FIELDS.includes(key) && !out.includes(key)) out.push(key);
  }
  return out.slice(0, MAX_SORT_FIELDS);
}

/**
 * `dir=asc|desc` for the chosen score fields: anything else is the default, high to low. With no
 * field chosen (Best match, or the college order) the direction does not apply, so it stays "desc".
 */
export function parseSortDir(raw: string | string[] | undefined, sorts: readonly SortField[]): SortDir {
  return sorts.length > 0 && (Array.isArray(raw) ? raw[0] : raw) === "asc" ? "asc" : "desc";
}

/**
 * A value nobody has is "no value": an unscored intern, or a sub-score of 0 (never rated). It sorts
 * last whichever way the list runs.
 */
const valueOf = (c: Sortable, f: SortField): number | null => {
  if (f === "score") return c.scored === false ? null : c.score;
  const v = c.ratings[f] ?? 0;
  return v > 0 ? v : null;
};

/** Negative when `a` ranks first. Falls back to the Findtern Score (desc) when no field is chosen. */
export function compareBySortFields(a: Sortable, b: Sortable, fields: readonly SortField[], dir: SortDir): number {
  const sign = dir === "asc" ? -1 : 1;
  for (const f of fields.length > 0 ? fields : (["score"] as const)) {
    const x = valueOf(a, f);
    const y = valueOf(b, f);
    if (x === null || y === null) {
      if (x === y) continue;
      return x === null ? 1 : -1;
    }
    const diff = y - x;
    if (diff !== 0) return sign * diff;
  }
  return 0;
}

/** The one thing the sort control picks: a score field, the Findtern Pro college order, or "" for Best match. */
export type SortChoice = SortField | "college" | "";

/** Today's implicit direction: scores and ratings high to low, colleges A-Z. */
export const defaultSortDir = (choice: SortChoice): SortDir => (choice === "college" ? "asc" : "desc");

export const sortChoiceOf = (sorts: readonly SortField[], collegeSort: CollegeSort | null): SortChoice => (collegeSort ? "college" : (sorts[0] ?? ""));

/** The direction shown for the current sort; null for Best match, which has one fixed order. */
export function activeSortDir(choice: SortChoice, dir: SortDir, collegeSort: CollegeSort | null): SortDir | null {
  return choice === "" ? null : choice === "college" ? (collegeSort ?? "asc") : dir;
}

/** The filter changes that pick a sort: its default direction, and no other order. */
export function pickSortPatch(choice: SortChoice): { sorts: SortField[]; dir: SortDir; collegeSort: CollegeSort | null } {
  return {
    sorts: choice === "" || choice === "college" ? [] : [choice],
    dir: "desc",
    collegeSort: choice === "college" ? defaultSortDir("college") : null,
  };
}

/** The filter change that flips the direction of the current sort (and nothing else). */
export const sortDirPatch = (choice: SortChoice, dir: SortDir): { dir: SortDir } | { collegeSort: CollegeSort } =>
  choice === "college" ? { collegeSort: dir } : { dir };

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

/** `sort=college&dir=desc` reads as Z-A too, so `dir` means the same for every sort; `sort=college_desc` already says it. */
export const collegeSortWithDir = (sort: CollegeSort | null, dirRaw: string | string[] | undefined): CollegeSort | null =>
  sort === "asc" && (Array.isArray(dirRaw) ? dirRaw[0] : dirRaw) === "desc" ? "desc" : sort;

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
