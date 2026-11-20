import { getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Server cache for the few GLOBAL, rarely-changing reads (plans and prices, platform settings, the featured-skills
 * list, the partner-college list). Five minutes, plus an immediate purge from every admin write that edits one
 * of them (`purgeServerCache` below; src/lib/server-cache-guard.test.ts fails if a writer forgets).
 *
 * Rules (the guard test pins the first two):
 *  - Never cache anything keyed or scoped by a person: no employerId / internId / userId / session, and no money
 *    state (proposals, payments, orders, timesheets, a specific employer's subscription or overrides).
 *  - Cache keys are fixed strings plus, at most, small non-user arguments (a setting key, a region flag).
 *  - The cached function must not call cookies() / headers() (unstable_cache forbids request data).
 *  - It must THROW on a failed read, never return a fallback: a database blip would otherwise be cached for
 *    five minutes. Callers wrap it and keep their own never-throws fallback outside the cache.
 */

/** Every cache tag, one per entity an admin can edit. */
export const CACHE_TAGS = {
  /** `platform_settings` rows (per-hire fee, stipend, activation fee, Pro config, AI link expiry). */
  settings: "platform-settings",
  /** Active `pricing_plans` rows. */
  plans: "pricing-plans",
  /** `website_featured_skills` rows (the skills catalog on the public site). */
  skills: "skills-catalog",
  /** Partner colleges shown on the public site. */
  colleges: "colleges",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/** Seconds a cached read may be served before it is read again. Decision D3: 5 minutes. */
export const SERVER_CACHE_SECONDS = 300;

const NO_CACHE_CONTEXT = "incrementalCache missing in unstable_cache";

/**
 * `unstable_cache(fn, keyParts, { tags, revalidate: 300 })` with one addition: outside a Next request or build
 * (unit tests, scripts) there is no cache to talk to and Next throws an invariant; there the function simply runs.
 * Errors thrown by `fn` itself are never swallowed and never cached.
 */
export function cachedRead<A extends unknown[], R>(
  keyParts: string[],
  tags: CacheTag[],
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  const cached = unstable_cache(fn, keyParts, { tags, revalidate: SERVER_CACHE_SECONDS });
  return async (...args: A) => {
    try {
      return await cached(...args);
    } catch (e) {
      if (e instanceof Error && e.message.includes(NO_CACHE_CONTEXT)) return fn(...args);
      throw e;
    }
  };
}

/** Purge these entities right after a successful admin write: the next read is a miss, no stale copy is served. */
export function purgeServerCache(...tags: CacheTag[]): void {
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
}

/**
 * unstable_cache stores JSON, so a cached `timestamp` column comes back as an ISO string. Turn the table's date
 * columns back into `Date`s so a cached row has exactly the shape the live query returns.
 */
export function reviveDates<T extends Record<string, unknown>>(table: PgTable, rows: T[]): T[] {
  const dateKeys = Object.entries(getTableColumns(table))
    .filter(([, col]) => col.dataType === "date")
    .map(([key]) => key);
  if (dateKeys.length === 0) return rows;
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const k of dateKeys) {
      const v = out[k];
      if (typeof v === "string") out[k] = new Date(v);
    }
    return out as T;
  });
}
