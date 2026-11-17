import { gte, lt, type AnyColumn, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * A custom From/To range from the query string (`YYYY-MM-DD`, both days
 * inclusive). Shared by the ledger screens and their CSV exports so the file
 * covers exactly the dates on screen; the transactions CSV used to drop the
 * range and export every date (ADM-07).
 */
export function parseDateRange(params: Record<string, string | undefined>): { from: Date | null; toExclusive: Date | null } {
  // India days, like every other date on the admin screens: the day starts at 00:00 IST (UTC+5:30), not 00:00 UTC.
  const IST_MS = 330 * 60_000;
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? Date.parse(v) - IST_MS : null);
  const from = valid(params.from);
  const to = valid(params.to);
  return {
    from: from == null ? null : new Date(from),
    toExclusive: to == null ? null : new Date(to + 86_400_000),
  };
}

export function dateRangeConditions(col: AnyColumn | SQLWrapper, params: Record<string, string | undefined>): SQL[] {
  const { from, toExclusive } = parseDateRange(params);
  return [from ? gte(col, from) : undefined, toExclusive ? lt(col, toExclusive) : undefined].filter(Boolean) as SQL[];
}
