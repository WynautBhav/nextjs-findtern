/**
 * Disabling an account locks it out on EVERY server instance at once, with the right answer for each kind of request.
 * Two production `next start` instances share one LOCAL database; the company is signed in on B, B's caches are warmed,
 * the admin deactivates on A, and B must refuse the very next request.
 *
 *   E2E_A=http://127.0.0.1:3201 E2E_B=http://127.0.0.1:3202 E2E_DATABASE_URL=postgresql://findtern@127.0.0.1:54401/findtern \
 *   MAIL_LOG_DIR=<A's cwd>/logs/mail node --test e2e/account-disable.e2e.mjs
 *
 * Needs scripts/seed.ts and scripts/seed-colleges.ts (hiring@northwind.dev, candidate@findtern.dev, tpo@jklu.edu.in,
 * admin@findtern.dev, password Findtern@2026). Both servers run with MAIL_MODE=log.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { testDatabaseUrl } from "./lib/env.mjs";

const A = process.env.E2E_A ?? "http://127.0.0.1:3201";
const B = process.env.E2E_B ?? "http://127.0.0.1:3202";
const DB = testDatabaseUrl(process.env.E2E_DATABASE_URL);
const MAIL_DIR = process.env.MAIL_LOG_DIR ?? join(process.cwd(), "logs", "mail");
const PASSWORD = "Findtern@2026";
const MSG = /Your account has been disabled\. Please contact admin at \S+@\S+\.$/;

let pool;
const q = async (sql, params) => (await pool.query(sql, params)).rows;
const ip = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}`;
const mailText = () => (existsSync(MAIL_DIR) ? readdirSync(MAIL_DIR).map((f) => readFileSync(join(MAIL_DIR, f), "utf8")).join("\n") : "");
const mailsTo = (addr, subject) => mailText().split("--- ").filter((e) => e.includes(`To: ${addr}`) && e.includes(`Subject: ${subject}`)).length;

async function login(base, path, email, password = PASSWORD) {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": ip() }, body: JSON.stringify({ email, password }) });
  const body = await res.json().catch(() => null);
  const jar = new Map(res.headers.getSetCookie().map((c) => c.split(";")[0].split(/=(.*)/s).slice(0, 2)));
  return { status: res.status, body, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), csrf: jar.has("ft_csrf") ? decodeURIComponent(jar.get("ft_csrf")) : "", ip: ip() };
}
async function call(base, s, method, path, body) {
  const res = await fetch(`${base}${path}`, { method, redirect: "manual", headers: { "content-type": "application/json", origin: base, cookie: s.cookie, "x-forwarded-for": s.ip, "x-csrf-token": s.csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text.slice(0, 80); }
  return { status: res.status, body: json, location: res.headers.get("location") };
}

let admin;
before(async () => {
  pool = new pg.Pool({ connectionString: DB });
  admin = await login(A, "/api/auth/admin/login", "admin@findtern.dev");
  assert.equal(admin.status, 200, "admin login on A");
});
after(async () => {
  await q("update employers set is_active = true where company_email = 'hiring@northwind.dev'");
  await q("update users set is_active = true where email = 'candidate@findtern.dev'");
  await q("update colleges set is_active = true");
  await pool.end();
});

const toggle = (s, path, body, method = "PATCH") => call(A, admin, method, path, body);
const refused = (r) => assert.ok(r.status === 401 || r.status === 403, `expected a refusal, got ${r.status}`);

test("company: deactivated on A, the very next requests on B are refused (page, read API, write API, money route)", async () => {
  const [{ id }] = await q("select id from employers where company_email = 'hiring@northwind.dev'");
  const co = await login(B, "/api/auth/employer/login", "hiring@northwind.dev");
  assert.equal(co.status, 200);
  // Warm B: the page and several API calls, so any per-process cache on B holds "active".
  for (let i = 0; i < 3; i++) {
    assert.equal((await call(B, co, "GET", "/employer/dashboard")).status, 200, "page loads while active");
    assert.equal((await call(B, co, "POST", "/api/presence/heartbeat")).status, i === 0 || i === 1 || i === 2 ? 200 : 429);
  }

  const t0 = Date.now();
  assert.equal((await toggle(admin, `/api/admin/companies/${id}`, { isActive: false })).status, 200, "deactivate on A");

  // Immediately, on the OTHER instance:
  const page = await call(B, co, "GET", "/employer/dashboard");
  assert.ok([302, 303, 307].includes(page.status), `page must redirect, got ${page.status}`);
  assert.match(page.location ?? "", /\/login\?as=employer/);
  const write = await call(B, co, "POST", "/api/presence/heartbeat");
  refused(write);
  const order = await call(B, co, "POST", `/api/employer/${id}/payment/razorpay/order`, { currency: "INR", proposalIds: ["x"], mode: "upfront", paymentIndex: 0 });
  refused(order);
  const cart = await call(B, co, "POST", "/api/employer/cart", { action: "noop" });
  refused(cart);
  console.log(`# company on B refused ${Date.now() - t0} ms after A's deactivate: page ${page.status} -> ${page.location}; heartbeat ${write.status}; razorpay order ${order.status}; cart ${cart.status}`);

  // The distinct machine answers (new contract).
  for (const r of [write, order, cart]) {
    assert.equal(r.status, 403);
    assert.equal(r.body?.code, "ACCOUNT_DISABLED");
    assert.match(r.body?.error, MSG);
  }
  assert.match(page.location, /reason=disabled/);
  const status = await call(B, co, "GET", "/api/auth/status");
  assert.equal(status.status, 403);
  assert.equal(status.body?.code, "ACCOUNT_DISABLED");
  // Signed out (no cookie) is NOT the disabled answer.
  const anon = await call(B, { cookie: "", csrf: "", ip: ip() }, "GET", "/api/auth/status");
  assert.equal(anon.status, 401);
  assert.equal(anon.body?.code, "SESSION_EXPIRED");
});

test("login: wrong password reveals nothing; the right password gets the one message; reactivation restores access", async () => {
  const wrong = await login(B, "/api/auth/employer/login", "hiring@northwind.dev", "Wrong-password-1");
  assert.equal(wrong.status, 401);
  assert.doesNotMatch(JSON.stringify(wrong.body), /disabled|deactivat|admin/i);
  const unknown = await login(B, "/api/auth/employer/login", "nobody-at-all@northwind.dev", "Wrong-password-1");
  assert.deepEqual(wrong.body, unknown.body, "same answer for a disabled account and an unknown one without the password");
  const right = await login(B, "/api/auth/employer/login", "hiring@northwind.dev");
  assert.equal(right.status, 403);
  assert.equal(right.body.code, "ACCOUNT_DISABLED");
  assert.match(right.body.error, MSG);
  const html = await (await fetch(`${B}/login?as=employer&reason=disabled`)).text();
  assert.match(html, /role="alert"/);
  assert.match(html, /Your account has been disabled\. Please contact admin at/);

  const [{ id }] = await q("select id from employers where company_email = 'hiring@northwind.dev'");
  assert.equal((await toggle(admin, `/api/admin/companies/${id}`, { isActive: true })).status, 200);
  const again = await login(B, "/api/auth/employer/login", "hiring@northwind.dev");
  assert.equal(again.status, 200);
  assert.equal((await call(B, again, "GET", "/employer/dashboard")).status, 200);
});

test("company mail: one on deactivation, none on a repeat, one 're-enabled' on activation", async () => {
  const [{ id }] = await q("select id from employers where company_email = 'hiring@northwind.dev'");
  const d0 = mailsTo("hiring@northwind.dev", "Your Findtern account has been disabled");
  const e0 = mailsTo("hiring@northwind.dev", "Your Findtern account is active again");
  const first = await toggle(admin, `/api/admin/companies/${id}`, { isActive: false });
  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.equal(first.body.emailed, false, "MAIL_MODE=log: written to the log, not delivered");
  assert.equal(first.body.emailFailed, false);
  assert.equal(mailsTo("hiring@northwind.dev", "Your Findtern account has been disabled"), d0 + 1);
  assert.match(mailText(), /Your company account Northwind Labs on Findtern has been disabled by our team\. You will not be able to sign in until it is re-enabled\. Please contact \S+@\S+\./);
  await toggle(admin, `/api/admin/companies/${id}`, { isActive: false });
  assert.equal(mailsTo("hiring@northwind.dev", "Your Findtern account has been disabled"), d0 + 1, "deactivating an inactive account sends nothing");
  await toggle(admin, `/api/admin/companies/${id}`, { isActive: true });
  assert.equal(mailsTo("hiring@northwind.dev", "Your Findtern account is active again"), e0 + 1);
  const audit = await q("select meta from admin_audit_log where action = 'company.update' and target_id = $1 order by created_at desc limit 3", [id]).catch(() => []);
  if (audit.length) assert.ok(!JSON.stringify(audit).match(/password|secret|@northwind/i), "audit meta carries no address or secret");
});

test("intern: refused on B right after A deactivates; mail once", async () => {
  const [{ id }] = await q("select id from users where email = 'candidate@findtern.dev'");
  const me = await login(B, "/api/auth/login", "candidate@findtern.dev");
  assert.equal(me.status, 200);
  assert.equal((await call(B, me, "GET", "/intern/dashboard")).status, 200);
  assert.equal((await call(B, me, "POST", "/api/presence/heartbeat")).status, 200);
  const d0 = mailsTo("candidate@findtern.dev", "Your Findtern account has been disabled");
  const r = await toggle(admin, `/api/users/${id}/deactivate`, undefined, "POST");
  assert.equal(r.status, 200);
  const page = await call(B, me, "GET", "/intern/dashboard");
  assert.ok([302, 303, 307].includes(page.status));
  assert.match(page.location, /login\?as=intern.*reason=disabled|reason=disabled.*as=intern/);
  const w = await call(B, me, "POST", "/api/presence/heartbeat");
  assert.equal(w.status, 403);
  assert.equal(w.body.code, "ACCOUNT_DISABLED");
  assert.equal(mailsTo("candidate@findtern.dev", "Your Findtern account has been disabled"), d0 + 1);
  await toggle(admin, `/api/users/${id}/deactivate`, undefined, "POST");
  assert.equal(mailsTo("candidate@findtern.dev", "Your Findtern account has been disabled"), d0 + 1);
  const wrong = await login(B, "/api/auth/login", "candidate@findtern.dev", "Wrong-password-1");
  assert.equal(wrong.status, 401);
  const right = await login(B, "/api/auth/login", "candidate@findtern.dev");
  assert.equal(right.status, 403);
  assert.match(right.body.error, MSG);
  await toggle(admin, `/api/users/${id}/activate`, undefined, "POST");
  assert.equal((await login(B, "/api/auth/login", "candidate@findtern.dev")).status, 200);
});

test("college: refused on B right after A deactivates the college; officers mailed once", async () => {
  const [{ cid }] = await q("select c.id cid from colleges c join college_admins a on a.college_id = c.id where a.email = 'tpo@jklu.edu.in'");
  const tpo = await login(B, "/api/auth/college/login", "tpo@jklu.edu.in");
  assert.equal(tpo.status, 200);
  assert.equal((await call(B, tpo, "GET", "/college")).status, 200);
  assert.equal((await call(B, tpo, "POST", "/api/presence/heartbeat")).status, 200);
  const d0 = mailsTo("tpo@jklu.edu.in", "Your Findtern account has been disabled");
  assert.equal((await toggle(admin, `/api/admin/colleges/${cid}`, { isActive: false })).status, 200);
  const page = await call(B, tpo, "GET", "/college");
  assert.ok([302, 303, 307].includes(page.status));
  assert.match(page.location, /reason=disabled/);
  const w = await call(B, tpo, "POST", "/api/presence/heartbeat");
  assert.equal(w.status, 403);
  assert.equal(w.body.code, "ACCOUNT_DISABLED");
  assert.equal(mailsTo("tpo@jklu.edu.in", "Your Findtern account has been disabled"), d0 + 1);
  assert.equal((await login(B, "/api/auth/college/login", "tpo@jklu.edu.in", "Wrong-password-1")).status, 401);
  const right = await login(B, "/api/auth/college/login", "tpo@jklu.edu.in");
  assert.equal(right.status, 403);
  assert.match(right.body.error, MSG);
  await toggle(admin, `/api/admin/colleges/${cid}`, { isActive: true });
  assert.equal((await login(B, "/api/auth/college/login", "tpo@jklu.edu.in")).status, 200);
});
