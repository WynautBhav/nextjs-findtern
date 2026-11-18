/**
 * Interview time-passed expiry: the real sweep (src/lib/interview-expiry-db.ts via sweepProposalExpiry) against a LOCAL throwaway
 * database. No server: it runs the sweep code directly, so it needs tsx for the `@/` aliases.
 *
 *   DATABASE_URL=postgresql://findtern:pw@localhost:54399/findtern_e2e SESSION_SECRET=verify-only-secret-at-least-32-characters \
 *     npx tsx --test e2e/interview-expiry.e2e.mjs
 *
 * Needs the seeded data (`scripts/seed.ts`). Refuses a non-loopback DB. Every row it makes is tagged and removed after.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { testDatabaseUrl } from "./lib/env.mjs";

const DB = testDatabaseUrl(process.env.DATABASE_URL);
process.env.DATABASE_URL = DB;
const TAG = "e2eInterviewExpiry";

let pool, sweep, employerId, interns, ids;
const q = async (sql, params) => (await pool.query(sql, params)).rows;
const NOW = new Date();
const at = (mins) => new Date(NOW.getTime() + mins * 60_000).toISOString();

async function clean() {
  const tagged = (await q(`select id from interviews where notes = '${TAG}'`)).map((r) => r.id);
  if (tagged.length) {
    await q("delete from notifications where data->>'interviewId' = any($1)", [tagged]);
    await q("delete from admin_audit_log where target_id = any($1)", [tagged]);
    await q("delete from interviews where id = any($1)", [tagged]);
  }
}

async function seed(key, { status, slots, selected = null, employer = employerId }) {
  const id = (await q("select gen_random_uuid()::text id"))[0].id;
  await q(
    `insert into interviews (id, employer_id, intern_id, status, slot1, slot2, slot3, selected_slot, timezone, notes, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'Australia/Sydney',$9, now() - interval '5 days', now() - interval '5 days')`,
    [id, employer, interns[Object.keys(ids).length], status, slots[0] ?? null, slots[1] ?? null, slots[2] ?? null, selected, TAG],
  );
  ids[key] = id;
}
const row = async (id) => (await q("select status, updated_at from interviews where id = $1", [id]))[0];
const status = async (key) => (await row(ids[key])).status;
const audit = async (id) => (await q("select action, admin_id, meta from admin_audit_log where target_id = $1", [id]));
const notes = async (id) => (await q("select dedupe_key from notifications where data->>'interviewId' = $1 order by dedupe_key", [id]));

before(async () => {
  pool = new pg.Pool({ connectionString: DB });
  await clean();
  employerId = (await q("select id from employers where company_email = 'hiring@northwind.dev'"))[0].id;
  interns = (await q("select o.user_id from intern_onboarding o order by o.user_id limit 20")).map((r) => r.user_id);
  ids = {};
  // The owner's rows: one ended today, one two days ago; plus the ones that must never change.
  await seed("endedToday", { status: "scheduled", slots: [at(-330)], selected: 1 }); // 14:15 IST seen at 15:30 IST
  await seed("endedTwoDaysAgo", { status: "scheduled", slots: [at(-2 * 1440 - 60)], selected: 1 }); // ended 48.5 h ago
  await seed("inviteAllPast", { status: "pending", slots: [at(-3000), at(-2900), at(-2800)] });
  await seed("inviteOneAhead", { status: "pending", slots: [at(-3000), at(600), null] });
  await seed("future", { status: "scheduled", slots: [at(180)], selected: 1 });
  await seed("inProgress", { status: "scheduled", slots: [at(-10)], selected: 1 });
  await seed("completed", { status: "completed", slots: [at(-2 * 1440)], selected: 1 });
  await seed("cancelled", { status: "cancelled", slots: [at(-2 * 1440)], selected: 1 });
  await seed("missed", { status: "missed", slots: [at(-2 * 1440)], selected: 1 });
  await seed("aiInterview", { status: "scheduled", slots: [at(-2 * 1440)], selected: 1, employer: "admin" });
  ({ sweepProposalExpiry: sweep } = await import("../src/lib/proposal-expiry-db.ts"));
});
after(async () => {
  await clean();
  await pool.end();
});

test("before: the owner's bug, as stored", async () => {
  console.log("BEFORE", JSON.stringify(Object.fromEntries(await Promise.all(Object.keys(ids).map(async (k) => [k, await status(k)])))));
  assert.equal(await status("endedToday"), "scheduled");
});

test("sweep: only time-passed open interviews become expired; audit row; notices only for the recent ones", async () => {
  const before = Object.fromEntries(await Promise.all(Object.keys(ids).map(async (k) => [k, await row(ids[k])])));
  const res = await sweep(NOW);
  console.log("SWEEP", JSON.stringify(res.interviews));
  assert.ok(res.interviews.expired >= 3);
  for (const k of ["endedToday", "endedTwoDaysAgo", "inviteAllPast"]) assert.equal(await status(k), "expired", k);
  for (const [k, want] of Object.entries({ inviteOneAhead: "pending", future: "scheduled", inProgress: "scheduled", completed: "completed", cancelled: "cancelled", missed: "missed", aiInterview: "scheduled" })) {
    assert.equal(await status(k), want, `${k} untouched`);
    assert.deepEqual(await row(ids[k]), before[k], `${k}: not even updated_at changed`);
  }
  const a = await audit(ids.endedToday);
  assert.deepEqual(a.map((r) => [r.action, r.admin_id]), [["interview.expired", "system"]]);
  assert.equal(a[0].meta.previousStatus, "scheduled");
  assert.equal(a[0].meta.reason, "time_passed_not_completed");
  assert.deepEqual(await audit(ids.future), []);
  // Notices: endedToday is inside 48 h (one per side); the one that ended 48.5 h ago is expired quietly (the 48 h rule).
  assert.deepEqual((await notes(ids.endedToday)).map((n) => n.dedupe_key), [`interview_time_passed:${ids.endedToday}:employer`, `interview_time_passed:${ids.endedToday}:intern`]);
  assert.deepEqual(await notes(ids.endedTwoDaysAgo), [], "older than 48 h: expired quietly");
  assert.equal((await notes(ids.inviteAllPast)).length, 2, "an invite whose last slot passed 46.7 h ago is still recent: one per side");
});

test("a second sweep changes nothing (idempotent): no rows, no new audit rows, no duplicate notices", async () => {
  const auditBefore = (await q("select count(*)::int n from admin_audit_log where action = 'interview.expired' and target_id = any($1)", [Object.values(ids)]))[0].n;
  const notesBefore = (await q("select count(*)::int n from notifications where data->>'interviewId' = any($1)", [Object.values(ids)]))[0].n;
  const res = await sweep(new Date());
  const mine = res.interviews.ids.filter((i) => Object.values(ids).includes(i));
  assert.deepEqual(mine, []);
  assert.equal((await q("select count(*)::int n from admin_audit_log where action = 'interview.expired' and target_id = any($1)", [Object.values(ids)]))[0].n, auditBefore);
  assert.equal((await q("select count(*)::int n from notifications where data->>'interviewId' = any($1)", [Object.values(ids)]))[0].n, notesBefore);
  console.log("AFTER", JSON.stringify(Object.fromEntries(await Promise.all(Object.keys(ids).map(async (k) => [k, await status(k)])))));
});

test("skip locked: a row another transaction holds is left alone, then picked up on the next run", async () => {
  await seed("locked", { status: "scheduled", slots: [at(-600)], selected: 1 });
  const holder = await pool.connect();
  try {
    await holder.query("begin");
    await holder.query("select id from interviews where id = $1 for update", [ids.locked]);
    const res = await sweep(new Date());
    assert.ok(!res.interviews.ids.includes(ids.locked), "locked row skipped, no wait");
    assert.equal(await status("locked"), "scheduled");
    await holder.query("commit");
  } finally {
    holder.release();
  }
  const res = await sweep(new Date());
  assert.ok(res.interviews.ids.includes(ids.locked));
  assert.equal(await status("locked"), "expired");
});

test("status is re-asserted: a row completed in between is never overwritten", async () => {
  await seed("racer", { status: "scheduled", slots: [at(-600)], selected: 1 });
  await q("update interviews set status = 'completed' where id = $1", [ids.racer]);
  const res = await sweep(new Date());
  assert.ok(!res.interviews.ids.includes(ids.racer));
  assert.equal(await status("racer"), "completed");
});
