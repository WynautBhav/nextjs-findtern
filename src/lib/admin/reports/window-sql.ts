import { and, gte, lt, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import type { BucketUnit } from "./window.ts";

/**
 * SQL twins of the window helpers. Timestamps are stored as UTC clock time
 * without a zone (see lib/admin/revenue), so a column is read as UTC, moved to
 * India time, then truncated: Monday-start weeks match `bucketKeyOf`.
 * Returns the bucket's first day as `YYYY-MM-DD`.
 */
export function bucketSql(col: SQLWrapper, unit: BucketUnit): SQL<string> {
  return sql<string>`to_char(date_trunc(${sql.raw(`'${unit}'`)}, (${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')), 'YYYY-MM-DD')`;
}

/** `col >= since AND col < until`, either bound open. A UTC instant binds as an ISO string cast to timestamp. */
export function inRange(col: SQLWrapper, since: Date | null | undefined, until: Date | null | undefined): SQL | undefined {
  return and(since ? gte(col as never, sql`${since.toISOString()}::timestamp`) : undefined, until ? lt(col as never, sql`${until.toISOString()}::timestamp`) : undefined);
}

/** Same, as a plain SQL fragment that is never undefined (for raw `sql` templates). */
export function rangeSql(col: SQLWrapper, since: Date | null | undefined, until: Date | null | undefined): SQL {
  return sql`${since ? sql`${col} >= ${since.toISOString()}::timestamp` : sql`true`} AND ${until ? sql`${col} < ${until.toISOString()}::timestamp` : sql`true`}`;
}
