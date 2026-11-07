import type { PoolClient } from "pg";

import { getDb } from "./index.ts";

export type PgClient = Pick<PoolClient, "query">;

/** One real Postgres transaction on a dedicated connection; commits on return, rolls back on throw. */
export async function withPgTransaction<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  const client = await getDb().$client.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** Adapts a client to the `execute(query, params)` shape used by src/lib/drives/*. */
export function asSqlExecutor(client: PgClient) {
  return {
    async execute(query: string, params: unknown[]) {
      const r = await client.query(query, params);
      return { rows: r.rows as Record<string, unknown>[], rowCount: r.rowCount ?? 0 };
    },
  };
}

/** Adapts a client to the `query(sql, params) => rows` shape used by src/lib/outbox. */
export function asRowsExecutor(client: PgClient) {
  return {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return (await client.query(sql, params)).rows as T[];
    },
  };
}
