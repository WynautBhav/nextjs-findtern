import type { Candidate } from "../skill-match.ts";

/**
 * The candidate count a featured-skill card shows: the size of its live bench, not the hand-typed `resource_count`.
 * The home page and the admin list both go through here, so the number an admin reads is the number visitors see.
 *
 * `pool` null means the candidate query failed: every row keeps its stored number. A count that cannot be worked out
 * for one row (a throwing matcher) keeps that row's stored number and leaves the others live, instead of failing the
 * whole list.
 */
export function withLiveCounts<T extends { title: string; resourceCount: number }>(
  rows: T[],
  pool: Candidate[] | null,
  count: (pool: Candidate[], title: string) => number,
): T[] {
  if (!pool) return rows;
  return rows.map((r) => {
    try {
      return { ...r, resourceCount: count(pool, r.title) };
    } catch {
      return r;
    }
  });
}
