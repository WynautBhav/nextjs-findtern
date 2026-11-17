/**
 * The pay gates together, end to end against a LOCAL throwaway database: every combination of
 * project taken down x start date passed x CGPA check state must refuse the payment unless ALL gates are clear,
 * on the order route and the promo preview (and so the full-waiver path, which goes through the same order route).
 * Offers are seeded by SQL (cloned from a seeded Northwind offer, tagged) and removed again.
 *
 *   E2E_BASE=http://localhost:3260 E2E_DATABASE_URL=postgresql://...127.0.0.1... TZ=UTC node --test e2e/pay-gates-matrix.e2e.mjs
 *
 * The server needs PAYMENTS_MODE=free and PAYMENTS_TEST_BUTTON=1 (an allowed payment settles at once). Needs the demo seed
 * (hiring@northwind.dev). Refuses a non-loopback database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { testDatabaseUrl } from "./lib/env.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3260";
const DB = testDatabaseUrl(process.env.E2E_DATABASE_URL);
const PASSWORD = "Findtern@2026";
const TAG = "e2eGatesMatrix";

let pool, emp, ids, employerId, downProjectId, projectId;
const q = async (sql, params) => (await pool.query(sql, params)).rows;
const ip = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}`;

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/employer/login`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip() }, body: JSON.stringify({ email, password: PASSWORD }) });
  assert.equal(res.status, 200, `login ${email}`);
  const jar = new Map(res.headers.getSetCookie().map((c) => c.split(";")[0].split(/=(.*)/s).slice(0, 2)));
  return { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), csrf: decodeURIComponent(jar.get("ft_csrf")), ip: ip() };
}
async function call(s, method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", origin: BASE, cookie: s.cookie, "x-forwarded-for": s.ip, "x-csrf-token": s.csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text.slice(0, 120); }
  return { status: res.status, body: json };
}
const order = (s, id, extra = {}) => call(s, "POST", `/api/employer/${employerId}/payment/razorpay/order`, { currency: "INR", proposalIds: [id], mode: "upfront", paymentIndex: 0, testPay: true, ...extra });
const day = async (offset) => (await q("select to_char((now() at time zone 'Asia/Kolkata')::date + $1::int, 'YYYY-MM-DD') d", [offset]))[0].d;

/** Clones a template proposal into a tagged scenario row. */
async function seedOffer(key, { status, startOffset, project, intern }) {
  const id = (await q("select gen_random_uuid()::text id"))[0].id;
  const start = await day(startOffset);
  await q(
    `insert into proposals select (jsonb_populate_record(null::proposals, to_jsonb(t) || jsonb_build_object('id', $1::text, 'status', $2::text, 'intern_id', $3::text, 'project_id', $4::text, 'hired_at', null, 'flow_type', 'direct', 'interview_id', null, 'offer_details', t.offer_details || jsonb_build_object('startDate', $5::text, '${TAG}', '1', 'acceptedAt', now() at time zone 'utc')))).* from proposals t where t.id = $6`,
    [id, status, intern, project, start, ids.template],
  );
  ids[key] = id;
}
const setCgpa = (internId, v) => q("update intern_onboarding set extra_data = coalesce(extra_data,'{}'::jsonb) || $2::jsonb where user_id = $1", [internId, JSON.stringify({ cgpaVerification: v })]);
const clearCgpa = (internId) => q("update intern_onboarding set extra_data = extra_data - 'cgpaVerification' where user_id = $1", [internId]);
const row = async (id) => (await q("select status, hired_at from proposals where id = $1", [id]))[0];

const START = { clear: 10, passed: -1 };
const CGPA = {
  none: null,
  verified: { status: "verified", claimedScore: "8.2", scoreType: "cgpa", semester: 5, decidedAt: new Date().toISOString() },
  pending: { status: "pending", claimedScore: "8.2", scoreType: "cgpa", semester: 5, requestedAt: new Date().toISOString() },
  incorrect: { status: "incorrect", claimedScore: "9.1", correctedScore: "8.0", scoreType: "cgpa", semester: 5, decidedAt: new Date(Date.now() - 3_600_000).toISOString(), decidedBy: "ops" },
};
const cells = [];
for (const down of [false, true]) for (const start of Object.keys(START)) for (const cgpa of Object.keys(CGPA)) cells.push({ down, start, cgpa, key: `${down ? "down" : "up"}-${start}-${cgpa}` });

async function clean() {
  const tagged = (await q(`select id from proposals where offer_details->>'${TAG}' = '1'`)).map((r) => r.id);
  if (tagged.length) {
    await q("delete from employer_payments where exists (select 1 from jsonb_array_elements_text(coalesce(raw->'notes'->'proposalIds','[]'::jsonb)) x where x = any($1))", [tagged]);
    await q("delete from notifications where data->>'proposalId' = any($1)", [tagged]);
    await q("delete from admin_audit_log where target_id = any($1)", [tagged]);
    await q("delete from proposals where id = any($1)", [tagged]);
  }
  await q("delete from projects where project_name = 'Gates matrix takedown'");
}

before(async () => {
  pool = new pg.Pool({ connectionString: DB });
  await clean();
  employerId = (await q("select id from employers where company_email = 'hiring@northwind.dev'"))[0].id;
  emp = await login("hiring@northwind.dev");
  const tpl = (await q("select id, project_id from proposals where employer_id = $1 order by id limit 1", [employerId]))[0];
  projectId = tpl.project_id;
  const interns = (await q("select o.user_id from intern_onboarding o where not exists (select 1 from proposals p where p.intern_id = o.user_id and p.employer_id = $1) order by o.user_id limit $2", [employerId, cells.length])).map((r) => r.user_id);
  assert.ok(interns.length >= cells.length, `needs ${cells.length} interns without a northwind proposal`);
  downProjectId = (await q("select gen_random_uuid()::text id"))[0].id;
  await q("insert into projects select (jsonb_populate_record(null::projects, to_jsonb(p) || jsonb_build_object('id', $2::text, 'project_name', 'Gates matrix takedown', 'taken_down_at', now() at time zone 'utc'))).* from projects p where p.id = $1", [projectId, downProjectId]);
  ids = { template: tpl.id, interns };
  for (const [i, c] of cells.entries()) {
    await clearCgpa(interns[i]);
    await seedOffer(c.key, { status: "accepted", startOffset: START[c.start], intern: interns[i], project: c.down ? downProjectId : projectId });
    if (CGPA[c.cgpa]) await setCgpa(interns[i], CGPA[c.cgpa]);
  }
});

after(async () => {
  if (!process.env.E2E_KEEP) {
    await clean();
    for (const u of ids?.interns ?? []) await clearCgpa(u);
  }
  await pool.end();
});

for (const c of cells) {
  const clear = !c.down && c.start === "clear" && (c.cgpa === "none" || c.cgpa === "verified");
  test(`${c.key}: ${clear ? "every gate clear, the payment settles and hires" : "refused on the order route and the promo preview, nothing hired"}`, async () => {
    const id = ids[c.key];
    if (clear) {
      const o = await order(emp, id);
      assert.equal(o.status, 200, `order: ${JSON.stringify(o.body)}`);
      assert.equal((await row(id)).status, "hired");
      return;
    }
    const o = await order(emp, id);
    assert.equal(o.status, 409, `order: ${JSON.stringify(o.body)}`);
    assert.ok(o.body.code, "a refusal carries a code");
    const p = await call(emp, "POST", `/api/employer/${employerId}/payment/validate-promo`, { code: "ANYCODE", currency: "INR", proposalIds: [id], mode: "upfront" });
    assert.equal(p.status, 409, `promo preview: ${JSON.stringify(p.body)}`);
    assert.equal(p.body.code, o.body.code, "the promo preview refuses with the same code as the order");
    assert.notEqual((await row(id)).status, "hired");
    // When several gates hold at once the first refusal is: the takedown, then the expiry, then the CGPA check.
    const expected = c.down ? "project_taken_down" : c.start === "passed" ? "offer_expired" : c.cgpa === "pending" ? "cgpa_verification_pending" : "cgpa_incorrect_unacked";
    assert.equal(o.body.code, expected, `first refusal for ${c.key}`);
  });
}
