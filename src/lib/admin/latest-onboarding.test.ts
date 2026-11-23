import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { internOnboarding, users } from "../db/schema.ts";
import { latestOnboardingJoin, latestOnboardingOrder } from "./latest-onboarding.ts";

/** Runs on the throwaway sweep DB inside a transaction that is ALWAYS rolled back; skipped on any other database. */
const url = process.env.DATABASE_URL ?? "";
const skip = !/127\.0\.0\.1:5435\/findtern_sweep$/.test(url) && "no throwaway sweep DB";

test("the join keeps one onboarding row per intern: the newest", { skip }, async () => {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("BEGIN");
    const dialect = new PgDialect();
    const [{ id }] = (await c.query(`SELECT id FROM users WHERE role = 'intern' LIMIT 1`)).rows;
    await c.query(`DELETE FROM intern_onboarding WHERE user_id = $1`, [id]);
    await c.query(`INSERT INTO intern_onboarding (id, user_id, extra_data, created_at) VALUES ('old-row', $1, '{"n":"old"}', now() - interval '2 days'), ('new-row', $1, '{"n":"new"}', now() - interval '1 day')`, [id]);
    const q = dialect.sqlToQuery(sql`SELECT ${internOnboarding.id} AS id FROM ${users} LEFT JOIN ${internOnboarding} ON ${latestOnboardingJoin(internOnboarding, users.id)} WHERE ${users.id} = ${id}`);
    const joined = (await c.query(q.sql, q.params)).rows;
    assert.deepEqual(joined.map((r) => r.id), ["new-row"]);
    const o = dialect.sqlToQuery(sql`SELECT id FROM ${internOnboarding} WHERE ${internOnboarding.userId} = ${id} ORDER BY ${sql.join([...latestOnboardingOrder(internOnboarding)], sql`, `)} LIMIT 1`);
    assert.deepEqual((await c.query(o.sql, o.params)).rows.map((r) => r.id), ["new-row"]);
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});
