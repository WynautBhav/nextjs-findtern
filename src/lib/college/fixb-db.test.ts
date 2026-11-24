import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { cgpaSqlText } from "./cgpa-sql.ts";
import { codeUnusableSql } from "../drives/code-eligibility.ts";
import { inIdList } from "../sql-ids.ts";

/** Fix round B: SQL run on a scratch college database inside a transaction that is ALWAYS rolled back. Skipped otherwise. */
const url = process.env.DATABASE_URL ?? "";
const scratch = /127\.0\.0\.1:5549\d\/findtern_ca_/.test(url);
const skip = !scratch && "no scratch college DB";

async function inRolledBackTx(fn: (c: pg.Client) => Promise<void>) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("BEGIN");
    await fn(c);
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
}

test("R2-04: cgpaSql rounds once, so the display, the min-CGPA filter and the 8+ band agree", { skip }, async () => {
  await inRolledBackTx(async (c) => {
    const q = (score: string, scoreType = "cgpa") =>
      c.query(`SELECT ${cgpaSqlText("a.x")} AS cgpa FROM (SELECT jsonb_build_object('score', $1::text, 'scoreType', $2::text) AS x) a`, [score, scoreType]).then((r) => r.rows[0].cgpa as number | null);
    assert.equal(await q("8.4651"), 8.47);
    assert.equal(await q("7.996"), 8);
    assert.equal(await q("8.5"), 8.5);
    assert.equal(await q("10"), 10);
    assert.equal(await q("10.4"), null, "above 10 is not a CGPA");
    assert.equal(await q("85", "percentage"), 8.95, "a percentage is converted: 85 / 9.5");
    assert.equal(await q("99", "percentage"), 10, "capped at 10");
    assert.equal(await q("76", ""), 8, "no type and above 10 reads as a percentage");
    assert.equal(await q("101", "percentage"), null, "above 100 is not a percentage");
    // What the screen prints is what the filter compares: 8.47 passes 'min 8.47'; 8.00 is in the 8+ band.
    const shown = (v: number) => (Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? v.toFixed(1) : v.toFixed(2));
    for (const s of ["8.4651", "7.996", "6.005", "9.995"]) {
      const v = (await q(s))!;
      assert.equal(Number(shown(v)), v, `${s}: the printed value is the stored value`);
    }
  });
});

test("R2-06 / R2-03: code mail skips a row whose verified email differs only by case, and a disabled student", { skip }, async () => {
  await inRolledBackTx(async (c) => {
    const u = (await c.query("SELECT id, email FROM users WHERE role = 'intern' AND is_active AND email_verified AND email <> lower(email) LIMIT 1")).rows[0]
      ?? (await c.query("SELECT id, email FROM users WHERE role = 'intern' AND is_active AND email_verified LIMIT 1")).rows[0];
    const college = (await c.query("SELECT id FROM colleges LIMIT 1")).rows[0].id;
    // Arrange an unmatched roster-like row: the account is only reachable by its (lower-cased) verified email.
    await c.query("UPDATE users SET email = upper(email) WHERE id = $1", [u.id]);
    await c.query("DELETE FROM intern_payments WHERE intern_id = $1", [u.id]);
    await c.query("UPDATE intern_onboarding SET extra_data = coalesce(extra_data, '{}'::jsonb) - 'payment' WHERE user_id = $1", [u.id]);
    await c.query("DELETE FROM college_denials WHERE user_id = $1", [u.id]);
    await c.query("DELETE FROM college_memberships WHERE user_id = $1 AND college_id <> $2", [u.id, college]);
    const row = `(SELECT NULL::varchar AS intern_id, lower($1::text) AS college_email_norm) e`;
    const unusable = async () => (await c.query(`SELECT ${codeUnusableSql("e", "$2::varchar")} AS bad FROM ${row}`, [u.email, college])).rows[0].bad as boolean;
    assert.equal(await unusable(), false, "an active, unpaid, free student is mailable");
    await c.query("UPDATE users SET is_active = false WHERE id = $1", [u.id]);
    assert.equal(await unusable(), true, "a disabled student is not mailed (matched by upper-case stored email)");
  });
});

test("PS-03: `id IN (SELECT unnest($1::text[]))` returns exactly what the long IN list returns", { skip }, async () => {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const ids = (await c.query("SELECT id FROM users WHERE role = 'intern' ORDER BY id")).rows.map((r) => r.id as string);
    const dialect = new PgDialect();
    const built = dialect.sqlToQuery(sql`SELECT u.id FROM users u JOIN intern_onboarding o ON o.user_id = u.id WHERE ${inIdList(sql.raw("u.id"), ids)} ORDER BY u.id`);
    assert.equal(built.params.length, 1, "one array parameter, not one per id");
    const viaArray = (await c.query(built.sql, built.params as unknown[])).rows.map((r) => r.id);
    const list = ids.map((_, i) => `$${i + 1}`).join(",");
    const viaList = (await c.query(`SELECT u.id FROM users u JOIN intern_onboarding o ON o.user_id = u.id WHERE u.id IN (${list}) ORDER BY u.id`, ids)).rows.map((r) => r.id);
    assert.ok(viaList.length > 0, "the seeded DB has students with onboarding rows");
    assert.deepEqual(viaArray, viaList);
  } finally {
    await c.end();
  }
});
