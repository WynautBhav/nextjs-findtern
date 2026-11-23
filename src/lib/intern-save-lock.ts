import { desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

export type InternTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Runs `fn` in a transaction that holds a per-intern advisory lock, so two requests for the same intern (parallel first
 * saves or uploads) take turns instead of both inserting a row. Keep `fn` to its own `tx` queries: it holds a pool
 * connection while it waits, so it must not need a second one.
 */
export async function withInternLock<T>(userId: string, fn: (tx: InternTx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`intern-save:${userId}`}))`);
    return fn(tx);
  });
}

/** The intern's document rows, newest first (the row every reader uses is the first). */
export function documentRowsNewestFirst(db: Pick<InternTx, "select">, userId: string) {
  return db.select().from(schema.internDocuments).where(eq(schema.internDocuments.userId, userId)).orderBy(desc(schema.internDocuments.createdAt));
}
