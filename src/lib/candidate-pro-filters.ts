import { HIDDEN_UNTIL_HIRE } from "./contact-scrub.ts";
import { readCgpaVerification } from "./cgpa-verification.ts";

/**
 * The two subscriber-only filters of the employer candidates page (Findtern Pro): a minimum CGPA (with a
 * "verified only" switch) and a college filter. Pure, so the rules are tested without a database. WHO may use
 * them is decided by the loader (`_query.ts`) from the employer's entitlement, never here.
 *
 * Scores: the profile keeps one `score` and a `scoreType` ("cgpa" or "percentage"). A CGPA compares as it is;
 * a percentage converts at percent / 9.5 and is flagged approximate so the page can say so.
 */

export const PERCENT_PER_CGPA = 9.5;
/** Colleges one filter can hold (a URL, not a database, is the limit). */
export const MAX_COLLEGES = 20;
/** Longest college name kept from a URL. */
const MAX_COLLEGE_LENGTH = 200;
/** College choices listed in the filter: the biggest first, the rest are reached by typing. */
export const MAX_COLLEGE_OPTIONS = 200;

/** A score on the 0-10 scale, and whether it was converted from a percentage. */
export type CgpaValue = { value: number; approx: boolean };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A stored score as a CGPA, or null when it is blank, not a plain number or out of range. */
export function cgpaOf(score: string | null | undefined, scoreType: string | null | undefined): CgpaValue | null {
  const cleaned = String(score ?? "")
    .trim()
    .replace(/\s*(%|\/\s*10)$/, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const type = String(scoreType ?? "").trim().toLowerCase();
  const asPercent = type === "percentage" || (type !== "cgpa" && n > 10);
  if (asPercent) return n <= 100 ? { value: Math.min(10, round2(n / PERCENT_PER_CGPA)), approx: true } : null;
  return n <= 10 ? { value: n, approx: false } : null;
}

/** One college, compared case-, width- and whitespace-insensitively. */
export function collegeKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

const tidy = (name: string) => name.replace(/\s+/g, " ").trim();

/**
 * The `colleges` URL value: one entry per repeated parameter, kept whole (a name such as "Indian Institute of
 * Technology, Bombay" has a comma), trimmed, each college once, at most MAX_COLLEGES.
 */
export function parseColleges(raw: string | string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of Array.isArray(raw) ? raw : [raw ?? ""]) {
    const name = tidy(String(value)).slice(0, MAX_COLLEGE_LENGTH).trim();
    const key = collegeKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_COLLEGES) break;
  }
  return out;
}

export type ProCriteria = { cgpaMin: number; cgpaVerified: boolean; colleges: string[] };

export const hasProCriteria = (c: ProCriteria): boolean => c.cgpaMin > 0 || c.cgpaVerified || c.colleges.length > 0;

/** What the filters read from one candidate. */
export type ProFacts = { cgpa: number | null; approx: boolean; verified: boolean; college: string | null };

/** The facts of a candidate: `academics` as the profile reader returns it, `extraData` the raw onboarding bag. */
export function proFactsOf(
  academics: { score?: string; scoreType?: string; institution?: string } | null | undefined,
  extraData: unknown,
): ProFacts {
  const score = cgpaOf(academics?.score, academics?.scoreType);
  const name = tidy(String(academics?.institution ?? ""));
  return {
    cgpa: score?.value ?? null,
    approx: score?.approx ?? false,
    verified: readCgpaVerification(extraData).status === "verified",
    college: name && name !== HIDDEN_UNTIL_HIRE ? name : null,
  };
}

export type CollegeOption = { name: string; count: number };

export type ProResult<T> = {
  kept: T[];
  /** Candidates left out only because they have no usable score (shown as a note). */
  hiddenNoScore: number;
  /** Of `kept`, how many rest on a percentage converted to CGPA (only counted while a CGPA filter is on). */
  approxKept: number;
  /** Colleges in the pool the CGPA filter leaves, with counts; the college filter itself does not shrink them. */
  options: CollegeOption[];
};

/**
 * Apply the filters to a pool: every active filter must match (AND). A candidate with no usable score never
 * matches an active CGPA filter; one with no college never matches a college filter.
 */
export function applyProFilters<T>(items: readonly T[], factsOf: (item: T) => ProFacts, c: ProCriteria): ProResult<T> {
  const cgpaActive = c.cgpaMin > 0 || c.cgpaVerified;
  const wanted = new Set(c.colleges.map(collegeKey));
  const cgpaPass = (f: ProFacts) => !cgpaActive || (f.cgpa !== null && f.cgpa >= c.cgpaMin && (!c.cgpaVerified || f.verified));
  const collegePass = (f: ProFacts) => wanted.size === 0 || (f.college !== null && wanted.has(collegeKey(f.college)));

  const kept: T[] = [];
  let hiddenNoScore = 0;
  let approxKept = 0;
  const spellings = new Map<string, Map<string, number>>();
  for (const item of items) {
    const f = factsOf(item);
    if (cgpaActive && f.cgpa === null && collegePass(f)) hiddenNoScore++;
    if (!cgpaPass(f)) continue;
    if (f.college !== null) {
      const key = collegeKey(f.college);
      const variants = spellings.get(key) ?? new Map<string, number>();
      variants.set(f.college, (variants.get(f.college) ?? 0) + 1);
      spellings.set(key, variants);
    }
    if (!collegePass(f)) continue;
    kept.push(item);
    if (cgpaActive && f.approx) approxKept++;
  }

  const options = [...spellings.values()]
    .map((variants) => {
      // One name per college: the spelling most candidates use, then the first in sort order.
      const name = [...variants.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
      return { name, count: [...variants.values()].reduce((a, b) => a + b, 0) };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_COLLEGE_OPTIONS);

  return { kept, hiddenNoScore, approxKept, options };
}
