import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { rosterRowLeftSql } from "./roster-left.ts";

/** FN-01: a roster row whose student left this college must drop out of "Not joined yet" / "On your list" (leavers vanish from every count and list). Scratch DB, always rolled back. */
const url = process.env.DATABASE_URL ?? "";
const scratch = /127\.0\.0\.1:5549\d\/findtern_ca_/.test(url);
const skip = !scratch && "no scratch college DB";

test("FN-01: roster row of a student who left is flagged, a live member's row is not", { skip }, async () => {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query(`SELECT r.college_id, r.email, m.id AS mid FROM college_roster r JOIN users u ON lower(u.email) = r.email JOIN college_memberships m ON m.user_id = u.id AND m.college_id = r.college_id AND m.left_at IS NULL LIMIT 2`);
    assert.equal(rows.length, 2, "seed has roster rows with live members");
    const flag = async (row: { college_id: string; email: string }) => {
      const q = new PgDialect().sqlToQuery(sql`SELECT ${rosterRowLeftSql(sql.raw("r.email"), row.college_id)} AS gone FROM college_roster r WHERE r.college_id = ${row.college_id} AND r.email = ${row.email}`);
      return (await c.query(q.sql, q.params)).rows[0].gone as boolean;
    };
    assert.equal(await flag(rows[0]), false, "live member: not a leaver");
    await c.query("UPDATE college_memberships SET left_at = now() WHERE id = $1", [rows[0].mid]);
    assert.equal(await flag(rows[0]), true, "left: flagged");
    assert.equal(await flag(rows[1]), false, "the other live member is untouched");
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});
