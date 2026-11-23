import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { IMPORT_CANDIDATE_USERS_SQL, PENDING_REVIEWS_SQL, VERIFY_MEMBERSHIP_SQL } from "../drives/admin-rules.ts";

/**
 * Integration audit (INT-01, INT-02): the SQL is run on a scratch college database inside a transaction that is ALWAYS
 * rolled back. Skipped unless DATABASE_URL names a findtern_ca_* database (the college-audit scratch databases).
 */
const url = process.env.DATABASE_URL ?? "";
const scratch = /127\.0\.0\.1:5549\d\/findtern_ca_/.test(url);

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

test("INT-01: a roster link does not revive a membership that ended by approved leave", { skip: !scratch && "no scratch college DB" }, async () => {
  await inRolledBackTx(async (c) => {
    const m = (await c.query("SELECT user_id, college_id FROM college_memberships WHERE left_at IS NULL LIMIT 1")).rows[0];
    if (!m) return;
    await c.query("UPDATE college_memberships SET left_at = now() WHERE user_id = $1", [m.user_id]);
    await c.query(VERIFY_MEMBERSHIP_SQL, [m.user_id, m.college_id]);
    const after = (await c.query("SELECT left_at FROM college_memberships WHERE user_id = $1", [m.user_id])).rows[0];
    assert.ok(after.left_at, "a student who left was re-added by the roster link");
  });
});

test("INT-01: a roster link still upgrades a live membership of the same college, and never moves a student to another college", { skip: !scratch && "no scratch college DB" }, async () => {
  await inRolledBackTx(async (c) => {
    const m = (await c.query("SELECT user_id, college_id FROM college_memberships WHERE left_at IS NULL LIMIT 1")).rows[0];
    const other = (await c.query("SELECT id FROM colleges WHERE id <> $1 LIMIT 1", [m.college_id])).rows[0];
    await c.query("UPDATE college_memberships SET status = 'pending', verified_by = NULL WHERE user_id = $1", [m.user_id]);
    await c.query(VERIFY_MEMBERSHIP_SQL, [m.user_id, m.college_id]);
    const up = (await c.query("SELECT status, verified_by FROM college_memberships WHERE user_id = $1", [m.user_id])).rows[0];
    assert.deepEqual(up, { status: "verified", verified_by: "roster" });
    if (other) {
      await c.query(VERIFY_MEMBERSHIP_SQL, [m.user_id, other.id]);
      const still = (await c.query("SELECT college_id FROM college_memberships WHERE user_id = $1", [m.user_id])).rows[0];
      assert.equal(still.college_id, m.college_id);
    }
  });
});

test("INT-02: a disabled account is not a candidate for a confirmed sheet (email auto-link or phone review)", { skip: !scratch && "no scratch college DB" }, async () => {
  await inRolledBackTx(async (c) => {
    const u = (await c.query("SELECT id, email, phone_number FROM users WHERE role = 'intern' AND is_active AND email_verified AND country_code = '+91' LIMIT 1")).rows[0];
    const find = async () => (await c.query(IMPORT_CANDIDATE_USERS_SQL, [[u.email], [u.phone_number]])).rows.map((r) => r.id);
    assert.ok((await find()).includes(u.id), "an active student is a candidate");
    await c.query("UPDATE users SET is_active = false WHERE id = $1", [u.id]);
    assert.ok(!(await find()).includes(u.id), "a disabled student was offered / auto-linked");
  });
});

test("INT-02: the identity-review queue only lists active accounts", () => {
  assert.match(PENDING_REVIEWS_SQL, /JOIN users u ON u\.id = v\.candidate_intern_id AND u\.is_active/);
});
