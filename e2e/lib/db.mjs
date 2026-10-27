/**
 * Direct access to the test database, for assertions and for the few
 * test-only state changes the story needs (see README "Time travel").
 *
 * The session is pinned to UTC and `timestamp without time zone` is parsed as
 * UTC, the same way the app's pool does (src/lib/db/index.ts), so `now()` in a
 * query and `Date.now()` here agree.
 */
import pg from "pg";

import { testDatabaseUrl } from "./env.mjs";

const TIMESTAMP_OID = 1114;

const types = {
  getTypeParser(oid, format) {
    if (oid === TIMESTAMP_OID) return (v) => (v === null ? null : new Date(`${v.replace(" ", "T")}Z`));
    return pg.types.getTypeParser(oid, format);
  },
};

let pool = null;

export function db() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: testDatabaseUrl(),
      ssl: false,
      max: 3,
      options: "-c TimeZone=UTC",
      types,
    });
  }
  return pool;
}

export async function rows(sql, params = []) {
  return (await db().query(sql, params)).rows;
}

export async function one(sql, params = []) {
  const r = await rows(sql, params);
  return r[0] ?? null;
}

export async function closeDb() {
  if (pool) await pool.end();
  pool = null;
}
