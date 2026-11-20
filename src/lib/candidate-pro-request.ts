import { hasProCriteria, parseColleges, type ProCriteria } from "./candidate-pro-filters.ts";
import { parseCollegeSort, type CollegeSort } from "./candidate-sort.ts";

/**
 * The Findtern Pro request as the URL spells it, with no database in sight: this file is also read by the browser
 * (the Candidates region builds links from it). Who may USE it is `candidate-pro-access.ts`.
 */

export type ProRequest = ProCriteria & { collegeSort: CollegeSort | null };

export const EMPTY_PRO_REQUEST: ProRequest = { cgpaMin: 0, cgpaVerified: false, colleges: [], collegeSort: null };

type Raw = string | string[] | undefined;
const first = (v: Raw): string | undefined => (Array.isArray(v) ? v[0] : v);

/** The URL's Pro parameters, bounded: CGPA floor 0-10 in tenths, a switch, whole college names, a college order. */
export function proRequestOf(params: { cgpaMin?: Raw; cgpaVerified?: Raw; colleges?: Raw; sort?: Raw }): ProRequest {
  const raw = String(first(params.cgpaMin) ?? "").trim();
  const n = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : 0;
  const values = params.cgpaVerified === undefined ? [] : Array.isArray(params.cgpaVerified) ? params.cgpaVerified : [params.cgpaVerified];
  return {
    cgpaMin: Number.isFinite(n) && n > 0 ? Math.min(10, Math.round(n * 10) / 10) : 0,
    cgpaVerified: values.some((v) => ["1", "true", "on"].includes(v.trim().toLowerCase())),
    colleges: parseColleges(params.colleges),
    collegeSort: parseCollegeSort(params.sort),
  };
}

/**
 * The URL pairs for a request (the college order rides in `sort`, written by the caller). One `colleges`
 * parameter per college, so a name with a comma, an ampersand or non-Latin letters survives a round trip.
 */
export function proQueryPairs(r: ProRequest): [string, string][] {
  const out: [string, string][] = [];
  if (r.cgpaMin > 0) out.push(["cgpaMin", String(r.cgpaMin)]);
  if (r.cgpaVerified) out.push(["cgpaVerified", "1"]);
  for (const college of r.colleges) out.push(["colleges", college]);
  return out;
}

export const hasProRequest = (r: ProRequest): boolean => hasProCriteria(r) || r.collegeSort !== null;

