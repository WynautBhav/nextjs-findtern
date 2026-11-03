/**
 * Headless URL state for admin tables. Pure functions (no React, no Next), so
 * the server `DataTable`, the client toolbar and the node tests share one
 * implementation. All state lives in the query string.
 */

export type TableKeys = {
  /** Page number. Two tables on one page must not share it. */
  pageKey: string;
  /** Rows per page. */
  perKey: string;
  sortKey: string;
  dirKey: string;
  searchKey: string;
};

export const DEFAULT_TABLE_KEYS: TableKeys = {
  pageKey: "page",
  perKey: "per",
  sortKey: "sort",
  dirKey: "dir",
  searchKey: "q",
};

export function resolveTableKeys(keys?: Partial<TableKeys>): TableKeys {
  return { ...DEFAULT_TABLE_KEYS, ...Object.fromEntries(Object.entries(keys ?? {}).filter(([, v]) => v)) };
}

type Bag = URLSearchParams | string;

const toParams = (bag: Bag) => new URLSearchParams(typeof bag === "string" ? bag : bag.toString());

/**
 * Sets (or with `null`/"" removes) one key. The page key resets unless the
 * caller is changing the page itself (`keepPage`).
 */
export function setParam(
  bag: Bag,
  key: string,
  value: string | null,
  keys: Pick<TableKeys, "pageKey">,
  opts: { keepPage?: boolean } = {},
): string {
  const next = toParams(bag);
  if (value === null || value === "") next.delete(key);
  else next.set(key, value);
  if (!opts.keepPage) next.delete(keys.pageKey);
  return next.toString();
}

/**
 * "Clear all": drops the search term, the filter keys and the page, and keeps
 * everything else (rows per page, sort, and any other table's custom keys).
 */
export function clearFilters(bag: Bag, filterKeys: readonly string[], keys: Pick<TableKeys, "pageKey" | "searchKey">): string {
  const next = toParams(bag);
  next.delete(keys.searchKey);
  next.delete(keys.pageKey);
  for (const key of filterKeys) next.delete(key);
  return next.toString();
}

/** True when the search box or any filter has a value (sort and paging do not count). */
export function hasActiveFilters(
  params: Readonly<Record<string, string | undefined>>,
  filterKeys: readonly string[],
  searchKey = DEFAULT_TABLE_KEYS.searchKey,
): boolean {
  return [searchKey, ...filterKeys].some((key) => Boolean(params[key]?.trim()));
}

/** The sort a header link or the sort select moves to. */
export function nextSort(
  params: Readonly<Record<string, string | undefined>>,
  column: string,
  keys: Pick<TableKeys, "sortKey" | "dirKey"> = DEFAULT_TABLE_KEYS,
): { sort: string; dir: "asc" | "desc" } {
  const active = params[keys.sortKey] === column;
  const dir = params[keys.dirKey] === "asc" ? "asc" : "desc";
  return { sort: column, dir: active && dir === "desc" ? "asc" : "desc" };
}

/** `sort:dir` value for the sort select, "" when no listed column is active. */
export function sortSelectValue(
  params: Readonly<Record<string, string | undefined>>,
  columns: readonly string[],
  keys: Pick<TableKeys, "sortKey" | "dirKey"> = DEFAULT_TABLE_KEYS,
): string {
  const sort = params[keys.sortKey];
  if (!sort || !columns.includes(sort)) return "";
  return `${sort}:${params[keys.dirKey] === "asc" ? "asc" : "desc"}`;
}

/** Splits a sort select value back into a sort and dir. */
export function parseSortSelectValue(value: string): { sort: string; dir: "asc" | "desc" } | null {
  const [sort, dir] = value.split(":");
  if (!sort || (dir !== "asc" && dir !== "desc")) return null;
  return { sort, dir };
}

/** Parses a per-page value against an allow-list, falling back to `fallback`. */
export function parsePer(value: string | null | undefined, allowed: readonly number[], fallback = 25): number {
  const n = Number(value);
  return allowed.includes(n) ? n : fallback;
}

/**
 * Selection scope key for BulkSelect: changes whenever the page, sort or any
 * filter changes, so a selection never outlives the rows it was made on.
 */
export function selectionScope(bag: Bag): string {
  const next = toParams(bag);
  next.sort();
  return next.toString();
}
