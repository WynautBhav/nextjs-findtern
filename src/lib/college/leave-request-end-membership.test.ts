import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { endMembership } from "./leave-request-db.ts";

/**
 * R2-01: ending a membership closes only what is still open for the student. The SQL runs on a scratch college database
 * inside a transaction that is ALWAYS rolled back. Skipped unless DATABASE_URL names a findtern_ca_* database.
 */
const url = process.env.DATABASE_URL ?? "";
const scratch = /127\.0\.0\.1:5549\d\/findtern_ca_/.test(url);

test("R2-01: a leave cancels open requests and calls only; finished history keeps its status and responded_at", { skip: !scratch && "no scratch college DB" }, async () => {
  const c = new pg.Client({ connectionString: url, options: "-c TimeZone=UTC" });
  await c.connect();
  try {
    await c.query("BEGIN");
    const m = (await c.query("SELECT user_id, college_id FROM college_memberships WHERE left_at IS NULL LIMIT 1")).rows[0];
    const emp = (await c.query("SELECT id FROM employers LIMIT 1")).rows[0];
    const by = (await c.query("SELECT id FROM users LIMIT 1")).rows[0];
    const drive = async (title: string, startsAt: string, endsAt: string, revoked: string | null) =>
      String((await c.query(
        `INSERT INTO college_drives (college_id, title, starts_at, ends_at, token_hash, created_by, revoked_at)
         VALUES ($1, $2, now() + $3::interval, now() + $4::interval, $5, $6, CASE WHEN $7::text IS NULL THEN NULL ELSE now() + $7::interval END) RETURNING id`,
        [m.college_id, title, startsAt, endsAt, `r2-01-${title}`, by.id, revoked],
      )).rows[0].id);
    const open = await drive("open", "-1 day", "1 day", null);
    const ended = await drive("ended", "-3 days", "-1 day", null);
    const revoked = await drive("revoked", "-1 day", "1 day", "-1 hour");
    const meet = async (driveId: string, status: string, startsAt: string) =>
      String((await c.query(
        `INSERT INTO college_drive_meetings (drive_id, employer_id, user_id, starts_at, status, meeting_link, responded_at)
         VALUES ($1, $2, $3, now() + $4::interval, $5, 'https://meet.example.com/r2-01', now() - interval '2 days') RETURNING id`,
        [driveId, emp.id, m.user_id, startsAt, status],
      )).rows[0].id);
    const ids = {
      reqOpen: await meet(open, "requested", "5 minutes"),
      accOpen: await meet(open, "accepted", "10 minutes"),
      accPast: await meet(open, "accepted", "-3 hours"),
      reqLapsed: await meet(open, "requested", "-3 hours"),
      accEnded: await meet(ended, "accepted", "-2 days"),
      reqRevoked: await meet(revoked, "requested", "5 minutes"),
    };
    await endMembership(c, String(m.user_id));
    const got = Object.fromEntries(
      (await c.query("SELECT id, status, responded_at < now() - interval '1 day' AS old FROM college_drive_meetings WHERE id = ANY($1)", [Object.values(ids)])).rows.map((r) => [r.id, r]),
    );
    const st = (k: keyof typeof ids) => got[ids[k]].status;
    assert.equal(st("reqOpen"), "cancelled", "an open request is cancelled");
    assert.equal(st("accOpen"), "cancelled", "an accepted call that has not happened is cancelled");
    assert.equal(st("reqRevoked"), "requested", "a revoked drive was already shut by closeDriveCalls; nothing here rewrites it");
    assert.equal(st("accPast"), "accepted", "a call whose time has passed is history");
    assert.equal(st("reqLapsed"), "requested", "a lapsed request is history (it reads as no reply)");
    assert.equal(st("accEnded"), "accepted", "a call of an ended drive is history");
    for (const k of ["accPast", "reqLapsed", "accEnded", "reqRevoked"] as const) assert.equal(got[ids[k]].old, true, `${k} keeps its responded_at`);
    for (const k of ["reqOpen", "accOpen"] as const) assert.equal(got[ids[k]].old, false, `${k} is stamped now`);
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});
