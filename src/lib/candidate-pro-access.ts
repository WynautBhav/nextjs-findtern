import { employerSubscription } from "@/lib/subscription/entitlement-db";
import type { SubscriptionState } from "./employer-subscription.ts";
import {
  applyProFilters,
  hasProCriteria,
  parseColleges,
  type CollegeOption,
  type ProCriteria,
  type ProFacts,
} from "./candidate-pro-filters.ts";
import { parseCollegeSort, sortByCollege, type CollegeSort } from "./candidate-sort.ts";

/**
 * Who may use the Findtern Pro candidate filters, and the one place that enforces it. The page reads the URL
 * into a `ProRequest`; `enforcePro` applies it only when the employer holds an active subscription. The
 * rest (a free employer, a lapsed one, the feature switched off, a failed lookup) gets the pool untouched,
 * so a stale or hand-edited link can neither filter nor sort. Never trust the URL: the entitlement decides.
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

/**
 * True only when the lookup says the subscription is active right now. A lookup that throws, rejects or
 * answers anything else is "no access" (fail closed): a failure must never hand out a paid feature.
 */
export async function proAccess(employerId: string, lookup: (employerId: string) => Promise<SubscriptionState> = (id) => employerSubscription(id)): Promise<boolean> {
  if (!employerId) return false;
  try {
    const state = await lookup(employerId);
    return state?.active === true;
  } catch {
    return false;
  }
}

export type ProOutcome<T> = {
  /** The pool after the filters (the whole pool without access). */
  items: T[];
  /** What was really applied: empty without access. */
  applied: ProRequest;
  /** The URL asked for a Pro filter or sort the employer may not use, so it was dropped. */
  ignored: boolean;
  hiddenNoScore: number;
  approxKept: number;
  options: CollegeOption[];
  /** Puts the college order on the ranked list (a no-op without access or without a college sort). */
  order: (ranked: T[]) => T[];
};

/** Filter `pool` by `request` if (and only if) `active`; everything else is returned as it came. */
export function enforcePro<T>(pool: readonly T[], request: ProRequest, active: boolean, factsOf: (item: T) => ProFacts): ProOutcome<T> {
  if (!active) {
    return { items: [...pool], applied: { ...EMPTY_PRO_REQUEST }, ignored: hasProRequest(request), hiddenNoScore: 0, approxKept: 0, options: [], order: (ranked) => ranked };
  }
  const r = applyProFilters(pool, factsOf, request);
  const dir = request.collegeSort;
  return {
    items: r.kept,
    applied: { ...request, colleges: [...request.colleges] },
    ignored: false,
    hiddenNoScore: r.hiddenNoScore,
    approxKept: r.approxKept,
    options: r.options,
    order: dir ? (ranked) => sortByCollege(ranked, (item) => factsOf(item).college, dir) : (ranked) => ranked,
  };
}
