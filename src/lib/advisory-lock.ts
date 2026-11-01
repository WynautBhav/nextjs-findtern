import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";

type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Run `fn` in a transaction that holds a Postgres advisory lock on `key`, so a
 * "check, then insert" can't be run by two requests at once (a double click,
 * two tabs): the second waits, then sees the first one's row. The lock is
 * released at commit. Keep only database work in `fn`, and run every query on
 * its `tx`: a second pool connection or an outbound call inside it holds the
 * lock (and a connection) while waiting.
 */
export function withLock<T>(key: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    return fn(tx);
  });
}
