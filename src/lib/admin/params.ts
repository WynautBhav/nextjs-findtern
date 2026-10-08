import { sql, type SQL } from "drizzle-orm";

/**
 * Shared admin list-query primitives.
 *
 * Every admin table on this app has the same three problems: a search box, a
 * row of filters, and pagination. Each one used to be hand-rolled per page,
 * which is how the dashboard ended up calling `.limit(50)` and showing a
 * truncated list under a "showing 1-5 of 438" footer that was pure fiction.
 *
 * These helpers are the single implementation: a `PageRequest` parsed from the
 * URL, an `ILIKE` predicate that escapes user input, and a `Page` shape that
 * every table renders from.
 */

/** Next.js 15+ hands `searchParams` to pages as a promise of raw values. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Coerces the raw search-param bag into plain strings. */
export function flattenParams(raw: RawSearchParams | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value) && typeof value[0] === "string") out[key] = value[0];
  }
  return out;
}

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;

/**
 * Parse `page`, `per` and `q` out of a query bag.
 *
 * Clamping matters here: `?page=-1` or `?per=99999` would otherwise reach the
 * database as a negative OFFSET (Postgres errors) or pull the whole table into
 * memory before rendering.
 */
export function parsePageRequest(params: Record<string, string>): {
  page: number;
  perPage: number;
  offset: number;
  search: string;
  set: (key: string, value: string | null) => Record<string, string>;
} {
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const rawPer = Number.parseInt(params.per ?? "25", 10) || 25;
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(rawPer) ? rawPer : 25;
  const search = (params.q ?? "").trim();

  return {
    page,
    perPage,
    offset: (page - 1) * perPage,
    search,
    /**
     * Returns a new param bag with one key changed, for building links.
     * Setting a value resets to page 1 — otherwise editing a filter while on
     * page 7 leaves you staring at an empty result set.
     */
    set: (key, value) => {
      const next: Record<string, string> = { ...params };
      if (value === null || value === "") delete next[key];
      else next[key] = value;
      if (key !== "page") delete next.page;
      return next;
    },
  };
}

/** Builds a query string from a param bag, skipping empty values. */
export function toQueryString(params: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value != null) search.set(key, value);
  }
  const str = search.toString();
  return str ? `?${str}` : "";
}

/**
 * A case-insensitive "contains" predicate across the given columns.
 *
 * `%` and `_` are escaped so that searching for a literal `_` does not turn
 * into a single-character wildcard — otherwise a search for `a_b` matches
 * `aXb` and the result count quietly disagrees with what the user sees.
 * Returns `undefined` for an empty needle so callers can spread it safely.
 */
export function searchAny(
  columns: SQL.Aliased[] | SQL[],
  needle: string,
): SQL | undefined {
  if (!needle) return undefined;
  const escaped = needle.replace(/([%_\\])/g, "\\$1");
  const parts = columns.map((c) => sql`${c} ILIKE ${`%${escaped}%`} ESCAPE '\\'`);
  return sql`(${sql.join(parts, sql` OR `)})`;
}

/** The uniform result shape every admin list query resolves to. */
export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

/**
 * Assembles a `Page` from a count query and a row query.
 *
 * `page` is re-clamped against the real row count: filtering from a populated
 * page 12 down to zero results must land on page 1, not on an empty page 12
 * with no way back.
 */
export function toPage<T>(
  rows: T[],
  total: number,
  requestedPage: number,
  perPage: number,
): Page<T> {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return { rows, total, page: Math.min(requestedPage, pages), perPage, pages };
}

/** "1-25 of 438" — the footer line above the pager. */
export function rangeLabel(page: Page<unknown>): string {
  if (page.total === 0) return "0 results";
  const start = (page.page - 1) * page.perPage + 1;
  const end = Math.min(start + page.rows.length - 1, page.total);
  return `${start}-${end} of ${page.total}`;
}

/** Compact count for stat tiles: 1200 → "1.2k". */
export function compactNumber(value: number): string {
  if (Math.abs(value) < 1000) return String(value);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
