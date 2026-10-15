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
  const pool = new pg.Pool({ connectionString, ssl, max: 10 });
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
