import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema.ts";

/**
 * Database client.
 *
 * Lazy singleton: the pool is created on first use so that `next build`
 * (which imports route modules without a live DATABASE_URL) does not crash.
 * Runtime requests without DATABASE_URL fail fast with a clear error.
 */
let _db: ReturnType<typeof createDb> | null = null;

const TIMESTAMP = pg.types.builtins.TIMESTAMP;
const parseTimestamptz = pg.types.getTypeParser(pg.types.builtins.TIMESTAMPTZ, "text") as (v: string) => Date;

/**
 * Pool type parsers: `timestamp without time zone` (OID 1114) read as UTC.
 *
 * Every timestamp column holds UTC wall time (the session is pinned to UTC
 * below), but node-postgres's default parser reads 1114 as *local* time, 5h30
 * off on an IST machine. This covers direct `pg` use of the pool. Drizzle
 * installs its own per-query parsers, so it does not change what the select
 * builder or `db.execute()` return; for those raw rows use `dbTimestamp`.
 */
export const utcTypes = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (oid === TIMESTAMP && format !== "binary") return (v: string) => parseUtc(v);
    return pg.types.getTypeParser(oid, format as "text");
  },
} as pg.CustomTypesConfig;

function parseUtc(value: string): Date {
  return value === "infinity" || value === "-infinity" ? parseTimestamptz(value) : parseTimestamptz(`${value}+00`);
}

/**
 * A timestamp read from a raw `db.execute(sql…)` row, as the right instant.
 *
 * Use this for every timestamp that comes out of `db.execute()`. Drizzle hands
 * those back as zone-less strings ("2026-10-27 10:15:36.905882"), and
 * `new Date(thatString)` reads them as *local* time: 5h30 off on an IST server,
 * or in an IST browser if the string is sent to the client. The select builder
 * already returns correct Dates and doesn't need this.
 *
 * Accepts that string, a string with an explicit zone ("…+00", ISO "…Z"), or a
 * Date; returns null for null/undefined/unparseable input.
 */
export function dbTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(v)) return null;
  const d = /Z$/i.test(v)
    ? new Date(v.replace(" ", "T"))
    : /[+-]\d{2}(:?\d{2})?$/.test(v)
      ? parseTimestamptz(v.replace("T", " ")) // explicit offset ("+00", "+05:30"): Postgres's own parser
      : parseUtc(v.replace("T", " "));
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const rejectUnauthorized =
    (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? "").trim().toLowerCase() !== "false";
  // Local dev clusters have no TLS. Defaulting it on would make every local
  // connection fail with a certificate error that looks like a code bug.
  const isLocal = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|\[::1\])/.test(
    connectionString,
  );
  const ssl = isLocal ? false : { rejectUnauthorized };
  // Every `timestamp` column is "without time zone" and Drizzle reads it as
  // UTC, but `defaultNow()` is evaluated in the session time zone. On a server
  // set to Asia/Kolkata that stored local wall time, read back 5h30 late (an
  // OTP cooldown of ~19,850 s). Pinning the session to UTC at connection
  // startup makes now() and JS agree, with no per-connection query to race.
  const pool = new pg.Pool({ connectionString, ssl, max: 10, options: "-c TimeZone=UTC", types: utcTypes });
  return drizzle(pool, { schema });
}

/**
 * Database schema is applied by `npm run db:reset`, which generates the DDL
 * from `schema.ts` and executes it. The client assumes the tables exist; a
 * missing table surfaces as a query error naming the table, which is the
 * honest failure mode.
 */

/**
 * Returns the Drizzle client.
 *
 * A missing DATABASE_URL no longer returns `null` - it throws. Callers that
 * want to degrade gracefully (the marketing pages, the dashboard read paths)
 * already wrap their queries in try/catch and fall back to an empty state, so
 * a silent null here would only hide the real reason the query failed.
 */
export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

/** True when a database is configured. Use to skip work, not to hide errors. */
export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export { schema };

/**
 * Every column of a table except `password`, for rows that are handed to a
 * browser component. Legacy accounts still hold plain-text passwords, so a
 * full row in a client prop puts them in the page source.
 */
export function withoutPassword<T extends { password: unknown }>(columns: T): Omit<T, "password"> {
  const { password, ...rest } = columns;
  void password;
  return rest;
}
