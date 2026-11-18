/**
 * Unanswered-offer expiry (sent / interview_scheduled past the start day), the opportunistic sweep and the cron route, against a
 * LOCAL throwaway database with a real `next start`. Offers are seeded by SQL; every row it makes is tagged and removed after.
 *
 *   # Mode 1: the production situation, CRON_SECRET unset. The cron route is closed; an employer page load sweeps.
 *   E2E_BASE=http://localhost:3130 E2E_DATABASE_URL=postgresql://findtern@127.0.0.1:54333/db TZ=UTC \
 *     node --test e2e/proposal-expiry-no-reply.e2e.mjs
 *   # Mode 2: server started with CRON_SECRET=<s> (pass the same as E2E_CRON_SECRET). Bearer cron route, idempotency, row-lock skip.
 *
 * The server needs `npm run db:seed`-style data (hiring@northwind.dev) and must NOT have SCHEDULERS=off. Refuses a non-loopback DB.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { testDatabaseUrl } from "./lib/env.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3130";
const DB = testDatabaseUrl(process.env.E2E_DATABASE_URL);
const CRON = process.env.E2E_CRON_SECRET ?? "";
const PASSWORD = "Findtern@2026";
const TAG = "e2eExpiryNoReply";

let pool, emp, employerId, ids, interns;
const q = async (sql, params) => (await pool.query(sql, params)).rows;
const ip = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}`;
const day = async (offset) => (await q("select to_char((now() at time zone 'Asia/Kolkata')::date + $1::int, 'YYYY-MM-DD') d", [offset]))[0].d;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/employer/login`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip() }, body: JSON.stringify({ email, password: PASSWORD }) });
  assert.equal(res.status, 200, `login ${email}`);
  const jar = new Map(res.headers.getSetCookie().map((c) => c.split(";")[0].split(/=(.*)/s).slice(0, 2)));
  return { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ip: ip() };
}
const page = (path) => fetch(`${BASE}${path}`, { headers: { cookie: emp.cookie, "x-forwarded-for": emp.ip }, redirect: "manual" });
const sweep = (auth) => fetch(`${BASE}/api/cron/proposal-expiry`, { headers: auth ? { authorization: `Bearer ${auth}` } : {} });

async function clean() {
  const tagged = (await q(`select id from proposals where offer_details->>'${TAG}' = '1'`)).map((r) => r.id);
  if (tagged.length) {
    await q("delete from notifications where data->>'proposalId' = any($1)", [tagged]);
    await q("delete from admin_audit_log where target_id = any($1)", [tagged]);
    await q("delete from proposals where id = any($1)", [tagged]);
  }
  await q("delete from platform_settings where key = 'proposal_expiry_sweep'");
}

async function seedOffer(key, { status, startOffset, hired = false, extra = {} }) {
  const id = (await q("select gen_random_uuid()::text id"))[0].id;
  const start = await day(startOffset);
  await q(
    `insert into proposals select (jsonb_populate_record(null::proposals, to_jsonb(t) || jsonb_build_object('id', $1::text, 'status', $2::text, 'intern_id', $3::text, 'flow_type', 'direct', 'interview_id', null, 'hired_at', $4::text, 'offer_details', t.offer_details || jsonb_build_object('startDate', $5::text, '${TAG}', '1') || $6::jsonb))).* from proposals t where t.id = $7`,
    [id, status, interns[Object.keys(ids).length - 1], hired ? new Date(Date.now() - 86_400_000).toISOString() : null, start, JSON.stringify(extra), ids.template],
  );
  ids[key] = id;
  return id;
}
const row = async (id) => (await q("select status, hired_at, offer_details from proposals where id = $1", [id]))[0];
const audit = async (id) => (await q("select action from admin_audit_log where target_id = $1", [id])).map((r) => r.action);
const notes = async (id) => (await q("select dedupe_key from notifications where data->>'proposalId' = $1 order by dedupe_key", [id])).map((r) => r.dedupe_key);

async function seedAll() {
  await seedOffer("sentPast", { status: "sent", startOffset: -1 });
  await seedOffer("bookedPast", { status: "interview_scheduled", startOffset: -1 });
  await seedOffer("sentToday", { status: "sent", startOffset: 0 });
  await seedOffer("sentFuture", { status: "sent", startOffset: 10 });
  await seedOffer("acceptedPast", { status: "accepted", startOffset: -1, extra: { acceptedAt: new Date().toISOString() } });
  await seedOffer("processing", { status: "processing", startOffset: -3 });
  await seedOffer("hired", { status: "hired", startOffset: -3, hired: true });
  await seedOffer("withdrawn", { status: "withdrawn", startOffset: -2 });
}

before(async () => {
  pool = new pg.Pool({ connectionString: DB });
  await clean();
  employerId = (await q("select id from employers where company_email = 'hiring@northwind.dev'"))[0].id;
  emp = await login("hiring@northwind.dev");
  const tpl = (await q("select id from proposals where employer_id = $1 order by id limit 1", [employerId]))[0];
  interns = (await q("select o.user_id from intern_onboarding o where not exists (select 1 from proposals p where p.intern_id = o.user_id and p.employer_id = $1) order by o.user_id limit 14", [employerId])).map((r) => r.user_id);
  assert.ok(interns.length >= 10, "needs 10 interns without a northwind proposal");
  ids = { template: tpl.id };
});

after(async () => {
  if (!process.env.E2E_KEEP) await clean();
  await pool.end();
});

function assertSwept() {
  return Promise.all([
    row(ids.sentPast).then((r) => {
      assert.equal(r.status, "expired");
      assert.equal(r.offer_details.expiredReason, "no_reply_past_start");
      assert.ok(r.offer_details.expiredAt);
      assert.ok(r.offer_details.lapsedAt, "a `sent` lapse stays a guarantee miss");
    }),
    row(ids.bookedPast).then((r) => {
      assert.equal(r.status, "expired");
      assert.equal(r.offer_details.expiredReason, "no_reply_past_start");
      assert.equal(r.offer_details.lapsedAt, undefined, "an interview_scheduled one never counted as a miss");
    }),
    row(ids.sentToday).then((r) => assert.equal(r.status, "expired", "00:00 IST on the start day is the boundary")),
    row(ids.sentFuture).then((r) => assert.equal(r.status, "sent")),
    row(ids.acceptedPast).then((r) => {
      assert.equal(r.status, "expired");
      assert.equal(r.offer_details.expiredReason, "unpaid_past_start");
      assert.equal(r.offer_details.lapsedAt, undefined);
    }),
    row(ids.processing).then((r) => assert.equal(r.status, "processing")),
    row(ids.hired).then((r) => assert.equal(r.status, "hired")),
    row(ids.withdrawn).then((r) => assert.equal(r.status, "withdrawn")),
  ]);
}

if (!CRON) {
  test("production situation: CRON_SECRET unset closes the cron route (401 for no header and for any bearer)", async () => {
    assert.equal((await sweep()).status, 401);
    assert.equal((await sweep("anything")).status, 401);
    assert.equal((await sweep("undefined")).status, 401);
  });

  test("an employer proposals page load sweeps in the background; the page itself answers fast", async () => {
    await seedAll();
    const t0 = Date.now();
    const res = await page("/employer/proposals");
    const ms = Date.now() - t0;
    assert.equal(res.status, 200);
    await res.text();
    let swept = false;
    for (let i = 0; i < 40 && !swept; i++) {
      swept = (await row(ids.sentPast)).status === "expired";
      if (!swept) await sleep(250);
    }
    assert.ok(swept, "the background sweep ran after the response");
    await assertSwept();
    console.log(`# proposals page answered in ${ms} ms while the sweep ran after it`);
  });

  test("audit rows, deduped notifications and the 10-minute DB claim", async () => {
    assert.deepEqual(await audit(ids.sentPast), ["proposal.expired_no_reply"]);
    assert.deepEqual(await audit(ids.acceptedPast), ["proposal.expired_unpaid"]);
    assert.deepEqual(await audit(ids.sentFuture), []);
    assert.deepEqual(await notes(ids.sentPast), [`proposal_expired_no_reply:${ids.sentPast}:employer`, `proposal_expired_no_reply:${ids.sentPast}:intern`]);
    assert.deepEqual(await notes(ids.processing), []);
    const claim = await q("select updated_at from platform_settings where key = 'proposal_expiry_sweep'");
    assert.equal(claim.length, 1);
  });

  test("throttle: a second page load inside the window sweeps nothing", async () => {
    const late = await seedOffer("late", { status: "sent", startOffset: -2 });
    await (await page("/employer/dashboard")).text();
    await (await page("/employer/proposals")).text();
    await sleep(4000);
    assert.equal((await row(late)).status, "sent", "the in-memory and DB guards held the second sweep back");
  });
} else {
  test("cron route: 401 without or with a wrong bearer; nothing swept", async () => {
    await seedAll();
    assert.equal((await sweep()).status, 401);
    assert.equal((await sweep("wrong")).status, 401);
    assert.equal((await row(ids.sentPast)).status, "sent");
  });

  test("cron route with the bearer sweeps both kinds; processing, hired, withdrawn and future offers are untouched", async () => {
    const res = await sweep(CRON);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.noReply.expired, 3, JSON.stringify(body));
    assert.equal(body.expired, 1, JSON.stringify(body));
    await assertSwept();
    assert.deepEqual(await audit(ids.bookedPast), ["proposal.expired_no_reply"]);
    assert.equal((await notes(ids.sentPast)).length, 2);
  });

  test("idempotent: a second run and three concurrent runs expire nothing more and notify nothing more", async () => {
    const before = (await q(`select count(*)::int n from notifications where type = 'proposal_expired_no_reply' and data->>'proposalId' = any($1)`, [Object.values(ids)]))[0].n;
    const runs = await Promise.all([sweep(CRON), sweep(CRON), sweep(CRON)].map((p) => p.then((r) => r.json())));
    for (const r of runs) assert.equal(r.noReply.expired + r.expired, 0, JSON.stringify(r));
    const after = (await q(`select count(*)::int n from notifications where type = 'proposal_expired_no_reply' and data->>'proposalId' = any($1)`, [Object.values(ids)]))[0].n;
    assert.equal(after, before);
    assert.deepEqual(await audit(ids.sentPast), ["proposal.expired_no_reply"]);
  });

  test("a concurrent fresh batch is expired exactly once across racing sweeps", async () => {
    const a = await seedOffer("raceA", { status: "sent", startOffset: -1 });
    const b = await seedOffer("raceB", { status: "interview_scheduled", startOffset: -1 });
    const runs = await Promise.all([sweep(CRON), sweep(CRON), sweep(CRON)].map((p) => p.then((r) => r.json())));
    assert.equal(runs.reduce((n, r) => n + r.noReply.expired, 0), 2, JSON.stringify(runs));
    assert.deepEqual(await audit(a), ["proposal.expired_no_reply"]);
    assert.deepEqual(await audit(b), ["proposal.expired_no_reply"]);
    assert.equal((await notes(a)).length, 2);
  });

  test("a row another session holds (the intern answering right now) is skipped, never overwritten; the next run takes it", async () => {
    const held = await seedOffer("held", { status: "sent", startOffset: -1 });
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select id from proposals where id = $1 for update", [held]);
      const r = await (await sweep(CRON)).json();
      assert.equal(r.noReply.expired, 0, JSON.stringify(r));
      assert.equal((await row(held)).status, "sent");
      // the intern's answer wins: accepted commits, the sweep must then leave it alone
      await c.query("update proposals set status = 'accepted' where id = $1", [held]);
      await c.query("commit");
    } finally {
      c.release();
    }
    const r2 = await (await sweep(CRON)).json();
    assert.equal(r2.noReply.expired, 0, "an accepted offer is not an unanswered one");
    assert.equal((await row(held)).status, "expired", "it is accepted past its start day, so the unpaid sweep, not the no-reply one, closes it");
    assert.equal((await row(held)).offer_details.expiredReason, "unpaid_past_start");
  });
}
