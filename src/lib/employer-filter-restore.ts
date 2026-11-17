/**
 * The part of a remembered query string that is worth restoring on a bare visit
 * to /employer/candidates: structured filters only.
 *
 * Why this exists: older builds saved `view=grid` (and other non-filter keys)
 * into the remembered filters. The page decides "bare visit" by looking for
 * filter keys, and `view` is not one, so restoring `?view=grid` was still a
 * bare visit and redirected again, forever. A typed keyword (`q`) is a one-off
 * search and is never restored.
 *
 * Pure and free of `@/` imports so it runs under plain `node --test`.
 */
import { withoutCollegeSort } from "./candidate-sort.ts";

/** The query keys that belong to Findtern Pro (the college sort rides inside `sort`). */
export const PRO_PARAMS = ["cgpaMin", "cgpaVerified", "colleges"] as const;

export function restorableFilters(saved: string, filterKeys: readonly string[]): string {
  let source: URLSearchParams;
  try {
    source = new URLSearchParams(saved);
  } catch {
    return "";
  }
  const allowed = new Set(filterKeys);
  const kept = new URLSearchParams();
  for (const [key, value] of source) {
    if (key === "q" || !allowed.has(key)) continue;
    kept.append(key, value);
  }
  return kept.toString();
}

/**
 * A saved query with the Pro filters and the college sort taken out: what an employer without an active
 * subscription gets restored (a stale cookie from before the subscription ended must not bring them back).
 */
export function withoutProParams(query: string): string {
  let source: URLSearchParams;
  try {
    source = new URLSearchParams(query);
  } catch {
    return "";
  }
  const kept = new URLSearchParams();
  for (const [key, value] of source) {
    if ((PRO_PARAMS as readonly string[]).includes(key)) continue;
    if (key === "sort") {
      const rest = withoutCollegeSort(value);
      if (rest) kept.append(key, rest);
      continue;
    }
    kept.append(key, value);
  }
  return kept.toString();
}
