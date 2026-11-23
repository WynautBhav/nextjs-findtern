import { employerSubscription } from "@/lib/subscription/entitlement-db";
import type { SubscriptionState } from "./employer-subscription.ts";
import { applyProFilters, type CollegeOption, type ProFacts } from "./candidate-pro-filters.ts";
import { sortByCollege } from "./candidate-sort.ts";

/**
 * Who may use the Findtern Pro candidate filters, and the one place that enforces it. The page reads the URL
 * into a `ProRequest`; `enforcePro` applies it only when the employer holds an active subscription. The
 * rest (a free employer, a lapsed one, the feature switched off, a failed lookup) gets the pool untouched,
 * so a stale or hand-edited link can neither filter nor sort. Never trust the URL: the entitlement decides.
 */

export { EMPTY_PRO_REQUEST, hasProRequest, proQueryPairs, proRequestOf, type ProRequest } from "./candidate-pro-request.ts";
import { EMPTY_PRO_REQUEST, hasProRequest, type ProRequest } from "./candidate-pro-request.ts";

/**
 * True only when the lookup says the subscription is active right now. A lookup that throws, rejects or
 * answers anything else is "no access" (fail closed): a failure must never hand out a paid feature.
 */
export async function proAccess(employerId: string, lookup: (employerId: string) => Promise<SubscriptionState> = (id) => employerSubscription(id)): Promise<boolean> {
  if (!employerId) return false;
  try {
    const state = await lookup(employerId);
    if (state?.active === true) return true;
  } catch {
    // fall through: no subscription read, so only a live campus drive can grant it
  }
  return inCampusDrive(employerId);
}

/**
 * Findtern Pro comes with a campus drive: a company inside a live drive (lib/college/campus-lock.ts) gets the Pro
 * candidate features for as long as the drive runs, with no subscription. Fail closed on any error.
 */
async function inCampusDrive(employerId: string): Promise<boolean> {
  try {
    const { activeCampusDrives } = await import("@/lib/college/campus-lock");
    return (await activeCampusDrives(employerId)).length > 0;
  } catch (err) {
    console.error("[pro-access] campus drive check failed", err);
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
