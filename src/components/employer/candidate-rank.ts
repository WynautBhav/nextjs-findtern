import { compareBySortFields, type SortField } from "../../lib/candidate-sort.ts";

/**
 * The candidates list order, pure so it can be tested.
 *
 * Chain: an explicit employer sort leads; with none chosen, interns who SAVED
 * the project's role come first (OA3: saving raises them in that employer's
 * matches, never the score). Then more matched skills, more matched cities,
 * the sort fields, the Findtern Score, and initials / id for a total order.
 */
export type Rankable = {
  id: string;
  initials: string;
  score: number;
  ratings: { communication: number; coding: number; aptitude: number; interview: number };
  skills: string[];
  preferredLocations: string[];
};

export type RankOptions = {
  sorts: readonly SortField[];
  dir: "asc" | "desc";
  /** The skills the list is filtered by (any case). */
  skillTerms: string[];
  /** "Most skills matched first". */
  skillPriority: boolean;
  /** Lower-cased city names the employer wants. */
  cities: string[];
  /** Intern ids that saved the project this view is scoped to. */
  saved: ReadonlySet<string>;
};

export function rankProfiles<T extends Rankable>(profiles: readonly T[], o: RankOptions): T[] {
  const lowered = o.skillTerms.map((t) => t.trim().toLowerCase());
  const cityMatches = (p: T) => {
    if (o.cities.length < 2) return 0;
    const prefs = new Set(p.preferredLocations.map((l) => l.split(",")[0].trim().toLowerCase()));
    return o.cities.filter((c) => prefs.has(c)).length;
  };
  const skillMatches = (p: T) => {
    if (!o.skillPriority || lowered.length < 2) return 0;
    // `readSkills` appends " · level" to object skills; match the name.
    const have = new Set(p.skills.map((x) => x.split(" · ")[0].trim().toLowerCase()));
    return lowered.filter((t) => have.has(t)).length;
  };
  const savedRank = (p: T) => (o.saved.has(p.id) ? 1 : 0);
  const chosen = o.sorts.length > 0;
  return [...profiles].sort(
    (a, b) =>
      (chosen ? compareBySortFields(a, b, o.sorts, o.dir) : savedRank(b) - savedRank(a)) ||
      skillMatches(b) - skillMatches(a) ||
      cityMatches(b) - cityMatches(a) ||
      compareBySortFields(a, b, o.sorts, o.dir) ||
      b.score - a.score ||
      a.initials.localeCompare(b.initials) ||
      a.id.localeCompare(b.id),
  );
}
