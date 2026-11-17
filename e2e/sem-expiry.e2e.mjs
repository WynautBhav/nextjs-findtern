/**
 * Unpaid-offer expiry, the pay gate and the CGPA acknowledgement, end to end against a LOCAL throwaway database.
 * Real routes, real transactions, a real employer session with CSRF; offers are seeded by SQL in each state.
 *
 *   E2E_BASE=http://localhost:3233 E2E_DATABASE_URL=postgresql://...127.0.0.1... E2E_CRON_SECRET=... TZ=UTC \
 *     [E2E_REPORT=/path/table.md] node --test e2e/sem-expiry.e2e.mjs
 *
 * The server needs PAYMENTS_MODE=free, PAYMENTS_TEST_BUTTON=1, CRON_SECRET and RAZORPAY_WEBHOOK_SECRET (a payment then settles at
 * once, through the same settlement as a real one; E2E_WEBHOOK_SECRET is the webhook secret). Needs `npm run db:seed` data (hiring@northwind.dev, hiring@urbancompany-ds.dev).
 * Every row it makes is tagged and removed before and after. Refuses a non-loopback database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
import pg from "pg";
import { testDatabaseUrl } from "./lib/env.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3233";
const DB = testDatabaseUrl(process.env.E2E_DATABASE_URL);
const CRON = process.env.E2E_CRON_SECRET ?? "";
const WEBHOOK_SECRET = process.env.E2E_WEBHOOK_SECRET ?? "";
const PASSWORD = "Findtern@2026";
const WAIVER = "FREE-WP3T-TEST-0001";

let pool, emp, other, ids, employerId, downProjectId, projectId;
const table = [];
const q = async (sql, params) => (await pool.query(sql, params)).rows;
const ip = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}`;

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/employer/login`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip() }, body: JSON.stringify({ email, password: PASSWORD }) });
  assert.equal(res.status, 200, `login ${email}`);
  const jar = new Map(res.headers.getSetCookie().map((c) => c.split(";")[0].split(/=(.*)/s).slice(0, 2)));
  return { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), csrf: decodeURIComponent(jar.get("ft_csrf")), ip: ip() };
}
async function call(s, method, path, body, { csrf = true, label } = {}) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", origin: BASE, cookie: s.cookie, "x-forwarded-for": s.ip, ...(csrf ? { "x-csrf-token": s.csrf } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text.slice(0, 120); }
  if (label) table.push({ label, status: res.status, code: json?.code ?? "", body: typeof json === "object" ? (json.error ?? JSON.stringify(json)).slice(0, 110) : json });
  return { status: res.status, body: json };
}
const order = (s, id, extra = {}) => call(s, "POST", `/api/employer/${employerId}/payment/razorpay/order`, { currency: "INR", proposalIds: [id], mode: "upfront", paymentIndex: 0, testPay: true, ...extra }, { label: extra.label });
const day = async (offset) => (await q("select to_char((now() at time zone 'Asia/Kolkata')::date + $1::int, 'YYYY-MM-DD') d", [offset]))[0].d;

async function clean() {
  const tagged = (await q("select id from proposals where offer_details->>'e2eWp3' = '1'")).map((r) => r.id);
  if (tagged.length) {
    await q("delete from employer_payments where exists (select 1 from jsonb_array_elements_text(coalesce(raw->'notes'->'proposalIds','[]'::jsonb)) x where x = any($1))", [tagged]);
    await q("delete from notifications where data->>'proposalId' = any($1)", [tagged]);
    await q("delete from admin_audit_log where target_id = any($1)", [tagged]);
    await q("delete from proposals where id = any($1)", [tagged]);
  }
  await q("delete from promo_code_usages where promo_code_id in (select id from promo_codes where code = $1)", [WAIVER]);
  await q("delete from promo_codes where code = $1", [WAIVER]);
  await q("delete from projects where project_name = 'WP3 takedown'");
}

/** Clones a template proposal into a tagged scenario row. */
async function seedOffer(key, { status, startOffset, project = projectId, hired = false, extra = {}, intern }) {
  const id = (await q("select gen_random_uuid()::text id"))[0].id;
  const start = await day(startOffset);
  await q(
    `insert into proposals select (jsonb_populate_record(null::proposals, to_jsonb(t) || jsonb_build_object('id', $1::text, 'status', $2::text, 'intern_id', $3::text, 'project_id', $4::text, 'hired_at', $5::text, 'flow_type', 'direct', 'interview_id', null, 'offer_details', t.offer_details || jsonb_build_object('startDate', $6::text, 'e2eWp3', '1', 'acceptedAt', now() at time zone 'utc') || $7::jsonb))).* from proposals t where t.id = $8`,
    [id, status, intern, project, hired ? new Date(Date.now() - 86_400_000).toISOString() : null, start, JSON.stringify(extra), ids.template],
  );
  ids[key] = id;
  return id;
}
const setCgpa = (internId, v) => q("update intern_onboarding set extra_data = coalesce(extra_data,'{}'::jsonb) || $2::jsonb where user_id = $1", [internId, JSON.stringify({ cgpaVerification: v })]);
const clearCgpa = (internId) => q("update intern_onboarding set extra_data = extra_data - 'cgpaVerification' where user_id = $1", [internId]);
const row = async (id) => (await q("select status, hired_at, offer_details from proposals where id = $1", [id]))[0];
const sweep = async () => (await fetch(`${BASE}/api/cron/proposal-expiry`, { headers: { authorization: `Bearer ${CRON}` } })).json();

before(async () => {
  assert.ok(CRON, "E2E_CRON_SECRET is required");
  pool = new pg.Pool({ connectionString: DB });
  await clean();
  employerId = (await q("select id from employers where company_email = 'hiring@northwind.dev'"))[0].id;
  emp = await login("hiring@northwind.dev");
  other = await login("hiring@urbancompany-ds.dev");
  const tpl = (await q("select id, project_id from proposals where employer_id = $1 order by id limit 1", [employerId]))[0];
  projectId = tpl.project_id;
  const interns = (await q("select o.user_id from intern_onboarding o where not exists (select 1 from proposals p where p.intern_id = o.user_id and p.employer_id = $1) order by o.user_id limit 14", [employerId])).map((r) => r.user_id);
  assert.ok(interns.length >= 12, "needs 12 interns without a northwind proposal");
  downProjectId = (await q("select gen_random_uuid()::text id"))[0].id;
  await q("insert into projects select (jsonb_populate_record(null::projects, to_jsonb(p) || jsonb_build_object('id', $2::text, 'project_name', 'WP3 takedown', 'taken_down_at', now() at time zone 'utc'))).* from projects p where p.id = $1", [projectId, downProjectId]);
  ids = { template: tpl.id, interns };
  const s = (i) => interns[i];
  await seedOffer("expired", { status: "accepted", startOffset: -1, intern: s(0) });
  await seedOffer("payable", { status: "accepted", startOffset: 10, intern: s(1) });
  await seedOffer("openOrder", { status: "accepted", startOffset: -1, intern: s(2) });
  await seedOffer("cgpaPending", { status: "accepted", startOffset: 10, intern: s(3) });
  await seedOffer("cgpaIncorrect", { status: "accepted", startOffset: 10, intern: s(4) });
  await seedOffer("down", { status: "accepted", startOffset: -2, intern: s(5), project: downProjectId });
  await seedOffer("processing", { status: "processing", startOffset: -3, intern: s(6) });
  await seedOffer("hired", { status: "hired", startOffset: -3, intern: s(7), hired: true });
  await seedOffer("startToday", { status: "accepted", startOffset: 0, intern: s(8) });
  await seedOffer("expiredAndCgpa", { status: "accepted", startOffset: -1, intern: s(9) });
  for (const i of [3, 4, 9]) await clearCgpa(s(i));
  await setCgpa(s(3), { status: "pending", claimedScore: "8.2", scoreType: "cgpa", semester: 5, requestedAt: new Date().toISOString() });
  await setCgpa(s(4), { status: "incorrect", claimedScore: "9.1", correctedScore: "8.0", scoreType: "cgpa", semester: 5, decidedAt: new Date(Date.now() - 3_600_000).toISOString(), decidedBy: "ops" });
  await setCgpa(s(9), { status: "pending", claimedScore: "8.2", scoreType: "cgpa", semester: 5, requestedAt: new Date().toISOString() });
  // A recent unpaid order covers the openOrder offer (what an employer who opened checkout before midnight has).
  await q("insert into employer_payments (employer_id, gateway, order_id, amount_minor, currency, status, raw) values ($1, 'free', $2, 0, 'INR', 'created', $3)", [employerId, `wp3_open_${ids.openOrder.slice(0, 8)}`, JSON.stringify({ notes: { proposalIds: [ids.openOrder], paymentMode: "total", employerId, e2eWp3: "1" } })]);
  // A full-waiver code for the employer audience (checked for consumption below).
  await q("insert into promo_codes (code, description, discount_type, discount_value, max_usages, used_count, valid_until, is_active, applies_to) values ($1, 'wp3 e2e', 'full_waiver', 100, 5, 0, now() + interval '7 days', true, 'employer')", [WAIVER]);
});

after(async () => {
  if (process.env.E2E_REPORT) {
    const md = ["| Call | HTTP | code | message |", "|---|---|---|---|", ...table.map((r) => `| ${r.label} | ${r.status} | ${r.code} | ${String(r.body).replaceAll("|", "/")} |`)].join("\n");
    writeFileSync(process.env.E2E_REPORT, md + "\n");
  }
  await clean();
  await pool.end();
});

const usage = async () => (await q("select (select used_count from promo_codes where code = $1) used, (select count(*)::int from promo_code_usages where promo_code_id = (select id from promo_codes where code = $1)) uses", [WAIVER]))[0];

test("before the sweeper: an expired offer is refused by the order route, promo preview and full-waiver path", async () => {
  const o = await order(emp, ids.expired, { label: "order, accepted unpaid, start day begun" });
  assert.equal(o.status, 409);
  assert.equal(o.body.code, "offer_expired");
  assert.match(o.body.error, /new proposal/);
  const t = await order(emp, ids.startToday, { label: "order, start date is today (IST)" });
  assert.equal(t.status, 409);
  assert.equal(t.body.code, "offer_expired");
  const before = await usage();
  const p = await call(emp, "POST", `/api/employer/${employerId}/payment/validate-promo`, { code: WAIVER, proposalIds: [ids.expired], mode: "upfront", currency: "INR" }, { label: "promo preview (waiver code) on expired offer" });
  assert.equal(p.status, 409);
  assert.equal(p.body.code, "offer_expired");
  const w = await order(emp, ids.expired, { promoCode: WAIVER, testPay: false, label: "full-waiver order on expired offer" });
  assert.equal(w.status, 409);
  assert.equal(w.body.code, "offer_expired");
  assert.deepEqual(await usage(), before, "no code use was consumed");
  assert.equal((await row(ids.expired)).status, "accepted", "refusal changes nothing");
  assert.equal((await q("select count(*)::int n from employer_payments where raw->'notes'->'proposalIds' ? $1", [ids.expired]))[0].n, 0, "no order row");
});

test("expired wins over a pending CGPA check", async () => {
  const o = await order(emp, ids.expiredAndCgpa, { label: "order, expired AND CGPA pending" });
  assert.equal(o.status, 409);
  assert.equal(o.body.code, "offer_expired");
});

test("CGPA gate: pending and corrected-unconfirmed are refused with their codes; promo preview too", async () => {
  const a = await order(emp, ids.cgpaPending, { label: "order, CGPA pending" });
  assert.equal(a.status, 409);
  assert.equal(a.body.code, "cgpa_verification_pending");
  assert.equal(a.body.error, "Findtern is still confirming the candidate's CGPA (usually 24-48 h). You can pay once it is confirmed.");
  const b = await order(emp, ids.cgpaIncorrect, { label: "order, CGPA corrected, not confirmed" });
  assert.equal(b.status, 409);
  assert.equal(b.body.code, "cgpa_incorrect_unacked");
  const before = await usage();
  const p = await call(emp, "POST", `/api/employer/${employerId}/payment/validate-promo`, { code: WAIVER, proposalIds: [ids.cgpaPending], mode: "upfront", currency: "INR" }, { label: "promo preview on CGPA-pending offer" });
  assert.equal(p.status, 409);
  assert.equal(p.body.code, "cgpa_verification_pending");
  const w = await order(emp, ids.cgpaPending, { promoCode: WAIVER, testPay: false, label: "full-waiver order on CGPA-pending offer" });
  assert.equal(w.status, 409);
  assert.deepEqual(await usage(), before);
});

test("cgpa-ack: wrong state, no CSRF, wrong owner, no such offer, happy path, repeat", async () => {
  const wrong = await call(emp, "POST", `/api/proposals/${ids.cgpaPending}/cgpa-ack`, {}, { label: "cgpa-ack, CGPA still pending (wrong state)" });
  assert.equal(wrong.status, 409);
  assert.equal(wrong.body.code, "cgpa_no_correction_pending");
  const plain = await call(emp, "POST", `/api/proposals/${ids.payable}/cgpa-ack`, {}, { label: "cgpa-ack, no correction at all" });
  assert.equal(plain.status, 409);
  const noCsrf = await call(emp, "POST", `/api/proposals/${ids.cgpaIncorrect}/cgpa-ack`, {}, { csrf: false, label: "cgpa-ack, no CSRF token" });
  assert.equal(noCsrf.status, 403);
  const stranger = await call(other, "POST", `/api/proposals/${ids.cgpaIncorrect}/cgpa-ack`, {}, { label: "cgpa-ack, another employer's offer" });
  assert.equal(stranger.status, 404);
  const none = await call(emp, "POST", `/api/proposals/00000000-0000-0000-0000-000000000000/cgpa-ack`, {}, { label: "cgpa-ack, unknown offer" });
  assert.equal(none.status, 404);
  assert.equal((await row(ids.cgpaIncorrect)).offer_details.cgpaAckAt, undefined, "refusals wrote nothing");
  const anon = await fetch(`${BASE}/api/proposals/${ids.cgpaIncorrect}/cgpa-ack`, { method: "POST", headers: { origin: BASE, "x-forwarded-for": ip() } });
  assert.ok([401, 403].includes(anon.status));
  const ok = await call(emp, "POST", `/api/proposals/${ids.cgpaIncorrect}/cgpa-ack`, {}, { label: "cgpa-ack, corrected CGPA (happy path)" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.alreadyConfirmed, false);
  const at = (await row(ids.cgpaIncorrect)).offer_details.cgpaAckAt;
  assert.ok(at);
  const again = await call(emp, "POST", `/api/proposals/${ids.cgpaIncorrect}/cgpa-ack`, {}, { label: "cgpa-ack, pressed twice (idempotent)" });
  assert.equal(again.status, 200);
  assert.equal(again.body.alreadyConfirmed, true);
  assert.equal((await row(ids.cgpaIncorrect)).offer_details.cgpaAckAt, at, "second press did not move the stamp");
  const ex = await call(emp, "POST", `/api/proposals/${ids.expired}/cgpa-ack`, {}, { label: "cgpa-ack, expired offer" });
  assert.equal(ex.status, 409);
});

test("takedown guard: cgpa-ack on a taken-down project is 409 project_taken_down", async () => {
  await setCgpa(ids.interns[5], { status: "incorrect", claimedScore: "9", correctedScore: "8", scoreType: "cgpa", semester: 5, decidedAt: new Date().toISOString() });
  const r = await call(emp, "POST", `/api/proposals/${ids.down}/cgpa-ack`, {}, { label: "cgpa-ack, taken-down project" });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "project_taken_down");
  await clearCgpa(ids.interns[5]);
});

test("sweeper: auth, then expires exactly the unpaid past-start offers", async () => {
  const noAuth = await fetch(`${BASE}/api/cron/proposal-expiry`);
  assert.equal(noAuth.status, 401);
  table.push({ label: "cron proposal-expiry, no bearer", status: noAuth.status, code: "", body: "Unauthorized" });
  const hiredBefore = await row(ids.hired);
  const procBefore = await row(ids.processing);
  const res = await sweep();
  table.push({ label: "cron proposal-expiry, with bearer", status: 200, code: "", body: JSON.stringify({ expired: res.expired, employers: res.employers }) });
  const got = new Set(res.ids);
  for (const k of ["expired", "down", "startToday", "expiredAndCgpa"]) assert.ok(got.has(ids[k]), `${k} expired`);
  for (const k of ["payable", "openOrder", "cgpaPending", "cgpaIncorrect", "processing", "hired"]) assert.ok(!got.has(ids[k]), `${k} left alone`);
  for (const k of ["expired", "down", "startToday", "expiredAndCgpa"]) {
    const r = await row(ids[k]);
    assert.equal(r.status, "expired");
    assert.equal(r.offer_details.expiredReason, "unpaid_past_start");
    assert.ok(r.offer_details.expiredAt);
    assert.equal(r.offer_details.lapsedAt, undefined, "never lapsedAt");
    assert.equal(r.hired_at, null);
  }
  assert.deepEqual(await row(ids.hired), hiredBefore, "hired row byte-identical");
  assert.deepEqual(await row(ids.processing), procBefore, "processing row byte-identical");
  for (const k of ["payable", "openOrder", "cgpaPending", "cgpaIncorrect"]) assert.equal((await row(ids[k])).status, "accepted", `${k} still accepted`);
  const audit = await q("select admin_id, action, target_id, meta from admin_audit_log where action = 'proposal.expired_unpaid' and target_id = any($1) order by target_id", [[ids.expired, ids.down, ids.startToday, ids.expiredAndCgpa]]);
  assert.equal(audit.length, 4);
  assert.ok(audit.every((a) => a.admin_id === "system" && a.meta.reason === "unpaid_past_start"));
  // Notifications: employer + intern for an ordinary one; intern only for the taken-down project's.
  const n = async (id, type) => (await q("select recipient_type, message from notifications where type = 'proposal_expired_unpaid' and data->>'proposalId' = $1 and recipient_type = $2", [id, type]));
  assert.equal((await n(ids.expired, "employer")).length, 1);
  assert.equal((await n(ids.expired, "intern")).length, 1);
  assert.equal((await n(ids.down, "employer")).length, 0, "taken-down project: employer not nagged");
  assert.equal((await n(ids.down, "intern")).length, 1);
  const msg = (await n(ids.expired, "employer"))[0].message;
  assert.doesNotMatch(msg, /₹|stipend|salary/i);
});

test("sweeper is idempotent: a second and a concurrent run change nothing and notify nothing more", async () => {
  const snap = async () => JSON.stringify(await q("select id, status, offer_details from proposals where offer_details->>'e2eWp3' = '1' order by id"));
  const before = await snap();
  const auditBefore = (await q("select count(*)::int n from admin_audit_log where action = 'proposal.expired_unpaid' and target_id = any($1)", [Object.values(ids).filter((v) => typeof v === "string")]))[0].n;
  const rs = await Promise.all([sweep(), sweep(), sweep()]);
  assert.deepEqual(rs.map((r) => r.expired), [0, 0, 0]);
  assert.equal(await snap(), before);
  const auditAfter = (await q("select count(*)::int n from admin_audit_log where action = 'proposal.expired_unpaid' and target_id = any($1)", [Object.values(ids).filter((v) => typeof v === "string")]))[0].n;
  assert.equal(auditAfter, auditBefore);
  table.push({ label: "cron proposal-expiry x3 concurrently, nothing left", status: 200, code: "", body: JSON.stringify(rs.map((r) => r.expired)) });
});

test("after the sweeper: an expired offer is still refused with offer_expired, not a vague 400", async () => {
  const o = await order(emp, ids.expired, { label: "order, offer already expired by the sweeper" });
  assert.equal(o.status, 409);
  assert.equal(o.body.code, "offer_expired");
  const p = await call(emp, "POST", `/api/employer/${employerId}/payment/validate-promo`, { code: WAIVER, proposalIds: [ids.expired], mode: "upfront", currency: "INR" }, { label: "promo preview, offer already expired by the sweeper" });
  assert.equal(p.status, 409);
  assert.equal(p.body.code, "offer_expired");
});

test("an open order freezes expiry; a webhook settling after the start day still hires (settlement is untouched)", async () => {
  assert.equal((await row(ids.openOrder)).status, "accepted", "the sweep left it accepted");
  // The order is open, so a second order for the same offer is the existing "already open" refusal, not an expiry.
  const dup = await order(emp, ids.openOrder, { label: "order, offer past start but an order is already open" });
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /already open/);
  // Money Razorpay captured for the order opened before midnight arrives after it: signed webhook, same endpoint as production.
  assert.ok(WEBHOOK_SECRET, "E2E_WEBHOOK_SECRET is required");
  const orderId = (await q("select order_id from employer_payments where raw->'notes'->'proposalIds' ? $1 and status = 'created'", [ids.openOrder]))[0].order_id;
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: `pay_wp3${Date.now()}`, order_id: orderId, amount: 0, currency: "INR", status: "captured" } } } });
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  const res = await fetch(`${BASE}/api/webhooks/razorpay`, { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": sig, "x-forwarded-for": ip() }, body });
  table.push({ label: "webhook payment.captured for an order opened before the start day", status: res.status, code: "", body: JSON.stringify(await res.json()) });
  assert.equal(res.status, 200);
  const r = await row(ids.openOrder);
  assert.equal(r.status, "hired", "hired although the start day had already begun");
  assert.ok(r.hired_at);
  assert.equal(r.offer_details.expiredReason, undefined);
  assert.equal((await q("select status from employer_payments where order_id = $1", [orderId]))[0].status, "paid");
  const again = await sweep();
  assert.ok(!again.ids.includes(ids.openOrder), "a hired offer is never swept");
});

test("a payable offer (start in the future, no CGPA flag) is unaffected: full-waiver order settles and hires it", async () => {
  const before = await usage();
  const w = await order(emp, ids.payable, { promoCode: WAIVER, testPay: false, label: "full-waiver order on a payable offer" });
  assert.equal(w.status, 200, JSON.stringify(w.body));
  assert.equal((await row(ids.payable)).status, "hired");
  const after = await usage();
  assert.equal(after.uses, before.uses + 1, "the code is consumed exactly once, on the paid order");
});

test("a confirmed CGPA correction is payable", async () => {
  const o = await order(emp, ids.cgpaIncorrect, { label: "order, CGPA correction confirmed" });
  assert.equal(o.status, 200, JSON.stringify(o.body));
  assert.equal((await row(ids.cgpaIncorrect)).status, "hired");
});

/** Holds the employer's payment lock (the one the order route and the sweeper take) in a separate session until released. */
async function holdLock() {
  const c = await pool.connect();
  await c.query("begin");
  await c.query("select pg_advisory_xact_lock(hashtext($1))", [`employer-pay:${employerId}`]);
  return { c, release: async (commit = true) => { await c.query(commit ? "commit" : "rollback"); c.release(); } };
}
const waiters = async () => (await q("select count(*)::int n from pg_locks where locktype = 'advisory' and not granted"))[0].n;
async function untilBlocked(promise) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 80 && (await waiters()) < 1; i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok((await waiters()) >= 1 && !done, "the request is waiting on the lock");
}

test("RACE A: the start day begins while an order waits for the lock: the order is refused INSIDE its transaction (stale client list)", async () => {
  const id = await seedOffer("raceA", { status: "accepted", startOffset: 1, intern: ids.interns[10] });
  const lock = await holdLock();
  // Passes the early gate (the start day is tomorrow), then blocks on the lock inside openOrder.
  const pending = order(emp, id, { label: "RACE A order: priced as payable, start day began while it waited" });
  await untilBlocked(pending);
  const yesterday = await day(-1);
  await lock.c.query("update proposals set offer_details = offer_details || $2::jsonb where id = $1", [id, JSON.stringify({ startDate: yesterday })]);
  await lock.release(true);
  const r = await pending;
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.code, "offer_expired");
  assert.equal((await row(id)).status, "accepted", "refusal changed nothing");
  assert.equal((await q("select count(*)::int n from employer_payments where raw->'notes'->'proposalIds' ? $1", [id]))[0].n, 0, "no order row was inserted");
});

test("RACE B: the order commits first, the waiting sweeper then sees it and leaves the offer accepted (never expires an offer with an open order)", async () => {
  const id = await seedOffer("raceB", { status: "accepted", startOffset: -1, intern: ids.interns[11] });
  const lock = await holdLock();
  const sweeping = sweep();
  await untilBlocked(sweeping);
  // What the order route's transaction does at commit: an open order row for the offer.
  await lock.c.query("insert into employer_payments (employer_id, gateway, order_id, amount_minor, currency, status, raw) values ($1, 'free', $2, 0, 'INR', 'created', $3)", [employerId, `wp3_race_${id.slice(0, 8)}`, JSON.stringify({ notes: { proposalIds: [id], paymentMode: "total", employerId, e2eWp3: "1" } })]);
  await lock.release(true);
  const res = await sweeping;
  table.push({ label: "RACE B sweeper (waited for an order that committed first)", status: 200, code: "", body: JSON.stringify({ expired: res.expired }) });
  assert.ok(!res.ids.includes(id));
  assert.equal((await row(id)).status, "accepted", "the offer with an open order is not expired");
});

test("RACE C: the sweep commits first, the waiting order is refused (no open order on an expired offer, ever)", async () => {
  const id = await seedOffer("raceC", { status: "accepted", startOffset: 1, intern: ids.interns[12] });
  const lock = await holdLock();
  const pending = order(emp, id, { label: "RACE C order, behind a sweep that expires the offer" });
  await untilBlocked(pending);
  await lock.c.query("update proposals set status = 'expired', offer_details = offer_details || $2::jsonb where id = $1", [id, JSON.stringify({ startDate: await day(-1), expiredReason: "unpaid_past_start", expiredAt: new Date().toISOString() })]);
  await lock.release(true);
  const r = await pending;
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "offer_expired");
  assert.equal((await q("select count(*)::int n from employer_payments where raw->'notes'->'proposalIds' ? $1", [id]))[0].n, 0);
});
