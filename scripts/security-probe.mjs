#!/usr/bin/env node
/**
 * Security probe on a LOCAL scratch database + local `next start`: object-level authorization (IDOR) between two
 * employers and two interns, role-boundary probes, unauthenticated probes, login enumeration, cookie flags,
 * security headers, CSRF and CORS.
 *
 *   DATABASE_URL=postgresql://findtern@127.0.0.1:54411/findtern_sa PROBE_BASE=http://127.0.0.1:3211 \
 *     node scripts/security-probe.mjs
 *
 * Exit 1 on any FAIL. Refuses a non-loopback base or database. Needs `node scripts/seed.ts` data (all personas use
 * the seed password).
 *
 * Verdicts: OK = 401/403/404/3xx; FAIL = 2xx or a body that carries the other party's data; INCONCLUSIVE = 400/422
 * (validation ran before the ownership check, so the probe proves nothing: read the handler); ERROR = 5xx.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pg = require("pg");

const BASE = process.env.PROBE_BASE || "http://127.0.0.1:3211";
const DB = process.env.DATABASE_URL || "";
const PW = "Findtern@2026";
const loop = (u) => ["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(u).hostname);
if (!loop(BASE) || !/@(127\.0\.0\.1|localhost)[:/]/.test(DB)) {
  console.error("refusing: PROBE_BASE and DATABASE_URL must be loopback");
  process.exit(2);
}

const db = new pg.Client({ connectionString: DB });
await db.connect();
const q = async (sql, a = []) => (await db.query(sql, a)).rows;

// ── Cast: employer A owns the most proposals; B is another employer with its own. Interns likewise. ──
const [empA, empB] = await q(`select e.id, e.company_email as email, e.company_name as name from employers e
  where exists (select 1 from proposals p where p.employer_id = e.id) and e.email_verified and e.is_active
  order by (select count(*) from proposals p where p.employer_id = e.id) desc limit 2`);
const empOf = (e) => e.id;
const pick = async (table, col, emp) => (await q(`select id from ${table} where ${col} = $1 limit 1`, [emp]))[0]?.id;
const A = { emp: empA, proposal: await pick("proposals", "employer_id", empOf(empA)), project: await pick("projects", "employer_id", empOf(empA)), interview: await pick("interviews", "employer_id", empOf(empA)), timesheet: await pick("timesheets", "employer_id", empOf(empA)) };
const B = { emp: empB, proposal: await pick("proposals", "employer_id", empOf(empB)), project: await pick("projects", "employer_id", empOf(empB)), interview: await pick("interviews", "employer_id", empOf(empB)), timesheet: await pick("timesheets", "employer_id", empOf(empB)) };
const internFor = async (proposalId) => (await q(`select u.id, u.email, u.first_name as fn from proposals p join users u on u.id = p.intern_id where p.id = $1`, [proposalId]))[0];
A.intern = await internFor(A.proposal);
B.intern = await internFor(B.proposal);
// An intern who has a timesheet / interview of their own, for the intern-side object probes.
const tsOwner = async (id) => (id ? (await q(`select intern_id from timesheets where id = $1`, [id]))[0]?.intern_id : null);
const ivOwner = async (id) => (id ? (await q(`select intern_id from interviews where id = $1`, [id]))[0]?.intern_id : null);
A.tsIntern = await tsOwner(A.timesheet);
A.ivIntern = await ivOwner(A.interview);
const userEmail = async (id) => (await q(`select email from users where id = $1`, [id]))[0]?.email;
A.tsInternEmail = A.tsIntern ? await userEmail(A.tsIntern) : null;
console.log("cast:", JSON.stringify({ empA: empA.email, empB: empB.email, internA: A.intern?.email, internB: B.intern?.email }));
if (!A.intern || !B.intern || A.intern.id === B.intern.id) throw new Error("need two different interns with proposals");

// ── tiny cookie-jar client ──
class Client {
  constructor(name) { this.name = name; this.jar = new Map(); this.setCookies = []; }
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  eat(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      this.setCookies.push(c);
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || v === "") this.jar.delete(k); else this.jar.set(k, v);
    }
  }
  async req(method, path, { body, headers = {}, raw, origin = BASE, redirect = "manual" } = {}) {
    const h = { ...headers };
    if (this.jar.size) h.cookie = this.cookieHeader();
    if (origin && method !== "GET" && method !== "HEAD") h.origin = origin;
    const csrf = this.jar.get("ft_csrf");
    if (csrf && method !== "GET") h["x-csrf-token"] = csrf;
    let b = raw;
    if (body !== undefined) { b = JSON.stringify(body); h["content-type"] = "application/json"; }
    const res = await fetch(BASE + path, { method, headers: h, body: b, redirect });
    this.eat(res);
    return res;
  }
  async login(apiPath, email) {
    const res = await this.req("POST", apiPath, { body: { email, password: PW } });
    if (!res.ok) throw new Error(`login ${email} ${apiPath} -> ${res.status} ${await res.text()}`);
    return res;
  }
}
const mk = async (name, api, email) => { const c = new Client(name); await c.login(api, email); return c; };
const empAc = await mk("empA", "/api/auth/employer/login", empA.email);
const empBc = await mk("empB", "/api/auth/employer/login", empB.email);
const intAc = await mk("intA", "/api/auth/login", A.intern.email);
const intBc = await mk("intB", "/api/auth/login", B.intern.email);
const admin = await mk("admin", "/api/auth/admin/login", "admin@findtern.dev");
const college = await mk("college", "/api/auth/college/login", "tpo@jklu.edu.in").catch(() => null);
const guest = new Client("guest");

// ── probes ──
const results = [];
const verdict = (status, text, markers) => {
  if (status >= 500) return "ERROR";
  if (status === 400 || status === 422) return "INCONCLUSIVE";
  if (status >= 300 && status < 400) return "OK";
  // Streamed pages answer 200 and render Next's not-found fallback (noindex meta) when the id is not the caller's.
  if (/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_REDIRECT/.test(text) && !markers.some((m) => m && text.includes(m))) return "OK";
  if (status === 401 || status === 403 || status === 404 || status === 405) return "OK";
  if (markers.some((m) => m && text.includes(m))) return "FAIL";
  return status >= 200 && status < 300 ? "FAIL" : "OK";
};
async function probe(who, method, path, { body, markers = [], note = "" } = {}) {
  const res = await who.req(method, path, { body });
  const text = await res.text();
  const v = verdict(res.status, text, markers);
  results.push({ who: who.name, method, path, status: res.status, v, note });
  return { res, text };
}

const aE = empOf(empA), bE = empOf(empB);
const empMarkers = [empA.name].filter((n) => n && n.length > 3);
const internMarkers = [A.intern.email, A.intern.fn].filter((n) => n && n.length > 3);

// Employer B (and guest, intern) against employer A's objects.
for (const who of [empBc, intBc, guest]) {
  const note = `${who.name} -> employer A's objects`;
  for (const [m, p, body] of [
    ["PUT", `/api/employer/projects/${A.project}`, { title: "pwned" }],
    ["DELETE", `/api/employer/projects/${A.project}`],
    ["POST", `/api/employer/projects/${A.project}/transition`, { to: "closed" }],
    ["POST", `/api/employer/projects/${A.project}/contact-admin`, { message: "x" }],
    ["PATCH", `/api/employer/${aE}`, { companyName: "pwned" }],
    ["POST", `/api/employer/${aE}/proposals`, {}],
    ["POST", `/api/employer/${aE}/projects`, {}],
    ["POST", `/api/employer/${aE}/interviews`, {}],
    ["POST", `/api/employer/${aE}/change-password`, { currentPassword: "x", newPassword: "Pwned@2026x" }],
    ["POST", `/api/employer/${aE}/full-time-offer`, {}],
    ["POST", `/api/employer/${aE}/payment/razorpay/order`, {}],
    ["POST", `/api/employer/${aE}/payment/cancel`, {}],
    ["POST", `/api/employer/${aE}/subscription/order`, {}],
    ["PATCH", `/api/proposals/${A.proposal}`, { rate: 1 }],
    ["PATCH", `/api/proposals/${A.proposal}/status`, { status: "cancelled" }],
    ["POST", `/api/proposals/${A.proposal}/cgpa-ack`, {}],
    ["GET", `/api/proposals/${A.proposal}/offer-letter`],
    ["POST", `/api/interviews/${A.interview}/feedback`, { rating: 5 }],
    ["POST", `/api/interviews/${A.interview}/join`, {}],
    ["POST", `/api/interviews/${A.interview}/mark-completed`, {}],
    ["POST", `/api/interviews/${A.interview}/mark-missed`, {}],
    ["POST", `/api/interviews/${A.interview}/reschedule`, {}],
    ["POST", `/api/interviews/${A.interview}/send-reminder`, {}],
    ["PATCH", `/api/timesheets/${A.timesheet}`, { note: "x" }],
    ["PATCH", `/api/timesheets/${A.timesheet}/decision`, { decision: "approved" }],
    ["GET", `/api/timesheets/${A.timesheet}/export`],
    ["GET", `/employer/proposal/${A.proposal}`],
    ["GET", `/employer/timesheets/${A.timesheet}`],
    ["GET", `/employer/projects/${A.project}/edit`],
  ]) {
    if (!p.includes("undefined") && !p.includes("null")) await probe(who, m, p, { body, markers: who === guest ? [] : empMarkers, note });
  }
}
// Intern B against intern A's objects.
const aI = A.intern.id;
for (const who of [intBc, empBc, guest]) {
  const note = `${who.name} -> intern A's objects`;
  for (const [m, p, body] of [
    ["GET", `/api/intern/${aI}/payment-status`],
    ["GET", `/api/intern/${aI}/payouts`],
    ["POST", `/api/intern/${aI}/payment/razorpay/order`, {}],
    ["POST", `/api/intern/${aI}/payment/validate-promo`, { code: "x" }],
    ["GET", `/api/intern/${aI}/ai-interview/apply`],
    ["POST", `/api/intern/${aI}/ai-interview/apply`, {}],
    ["PATCH", `/api/users/${aI}`, { firstName: "pwned" }],
    ["POST", `/api/users/${aI}/change-password`, { currentPassword: "x", newPassword: "Pwned@2026x" }],
    ["POST", `/api/users/${aI}/deactivate`, {}],
    ["POST", `/api/users/${aI}/activate`, {}],
    ["PATCH", `/api/proposals/${A.proposal}/status`, { status: "accepted" }],
    ["GET", `/api/proposals/${A.proposal}/offer-letter`],
    ["GET", `/intern/proposals/${A.proposal}`],
    ["POST", `/api/interviews/${A.interview}/select-slot`, { slot: new Date().toISOString() }],
    ["PATCH", `/api/intern/timesheets/${A.timesheet}`, { note: "x" }],
    ["DELETE", `/api/intern/timesheets/${A.timesheet}`],
    ["POST", `/api/intern/timesheets/${A.timesheet}/submit`, {}],
    ["GET", `/api/timesheets/${A.timesheet}/export`],
    ["GET", `/employer/intern/${aI}`],
  ]) {
    if (!p.includes("undefined") && !p.includes("null")) await probe(who, m, p, { body, markers: who === guest ? [] : internMarkers, note });
  }
}
// A's own intern against objects of intern/employer B's proposal.
await probe(intAc, "PATCH", `/api/proposals/${B.proposal}/status`, { body: { status: "accepted" }, note: "internA -> B's proposal" });
await probe(intAc, "GET", `/intern/proposals/${B.proposal}`, { markers: [B.intern.email], note: "internA -> B's proposal page" });

// Role boundaries: non-admin on admin surfaces and the reverse.
for (const who of [empBc, intBc, guest, ...(college ? [college] : [])]) {
  for (const [m, p] of [["GET", "/api/admin/users"], ["GET", "/api/admin/users/export"], ["GET", "/api/admin/audit-log/export"], ["GET", "/api/admin/payouts/export"], ["GET", "/api/admin/export"], ["GET", "/api/admin/search?q=a"], ["GET", "/admin/dashboard"], ["GET", "/api/cron/tick"], ["POST", "/api/cron/tick"], ["GET", "/api/cron/payment-reminders"], ["GET", "/api/cron/refund-reconcile"], ["GET", "/api/cron/proposal-expiry"], ["GET", "/api/cron/roster-import-purge"], ["GET", "/api/cron/email-outbox"]]) {
    await probe(who, m, p, { note: `${who.name} -> admin/cron`, body: m === "POST" ? {} : undefined });
  }
}
if (college) for (const [m, p] of [["GET", `/employer/dashboard`], ["GET", `/intern/dashboard`], ["GET", `/api/intern/${aI}/payouts`], ["GET", `/api/proposals/${A.proposal}/offer-letter`]]) await probe(college, m, p, { note: "college -> other roles" });
// Cron with a wrong / near-miss secret.
for (const auth of ["Bearer wrong", "Bearer ", "bearer " + process.env.CRON_SECRET, "Basic abc", "Bearer undefined", "Bearer null"]) {
  const res = await fetch(BASE + "/api/cron/tick", { headers: { authorization: auth } });
  results.push({ who: "guest", method: "GET", path: `/api/cron/tick [${auth.slice(0, 12)}]`, status: res.status, v: res.status === 401 ? "OK" : "FAIL", note: "cron bad secret" });
}

// ── enumeration: body shape and timing across unknown / wrong password / disabled-not-tested here ──
const enumRows = [];
for (const [api, known] of [["/api/auth/login", A.intern.email], ["/api/auth/employer/login", empA.email], ["/api/auth/admin/login", "admin@findtern.dev"], ["/api/auth/college/login", "tpo@jklu.edu.in"]]) {
  const t = async (email, pw) => {
    const n = 4; const ts = []; let body = "", status = 0;
    for (let i = 0; i < n; i++) {
      const s = performance.now();
      const r = await fetch(BASE + api, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email: i ? `x${i}.${email}` : email, password: pw }) });
      ts.push(performance.now() - s); status = r.status; body = await r.text();
    }
    ts.sort((a, b) => a - b);
    return { median: ts[Math.floor(n / 2)], status, body };
  };
  const unknown = await t(`nobody-${Date.now()}@example.com`, "Wrong@2026pw");
  const wrong = await t(known, "Wrong@2026pw");
  const same = unknown.status === wrong.status && unknown.body === wrong.body;
  enumRows.push({ api, unknownMs: Math.round(unknown.median), wrongMs: Math.round(wrong.median), sameBody: same });
  results.push({ who: "guest", method: "POST", path: api, status: unknown.status, v: same ? "OK" : "FAIL", note: `enumeration: unknown ${Math.round(unknown.median)}ms vs wrong-pw ${Math.round(wrong.median)}ms, same body+status=${same}` });
  if (unknown.median < wrong.median * 0.4) results.push({ who: "guest", method: "POST", path: api, status: 0, v: "FAIL", note: "timing class differs (unknown email is far faster)" });
}

// ── headers / cookies / CORS / CSRF ──
const hdrs = {};
for (const p of ["/", "/login", "/api/auth/status", "/employer/dashboard"]) {
  const r = await fetch(BASE + p, { redirect: "manual" });
  hdrs[p] = Object.fromEntries(["content-security-policy", "content-security-policy-report-only", "strict-transport-security", "x-frame-options", "referrer-policy", "permissions-policy", "x-content-type-options", "x-powered-by", "server", "access-control-allow-origin", "cache-control"].map((k) => [k, r.headers.get(k)]));
}
const cookieFlags = [];
for (const c of [empAc, intAc, admin, ...(college ? [college] : [])]) for (const sc of c.setCookies) {
  const name = sc.split("=")[0];
  cookieFlags.push({ who: c.name, name, httpOnly: /httponly/i.test(sc), secure: /;\s*secure/i.test(sc), sameSite: (sc.match(/samesite=(\w+)/i) || [])[1] || null, maxAge: (sc.match(/max-age=(\d+)/i) || [])[1] || null });
}
// CSRF: cross-origin POST with the session cookie but a foreign Origin, no token.
const csrf = [];
for (const [who, path, body] of [[empAc, "/api/notifications/read-all", {}], [intAc, "/api/notifications/read-all", {}], [admin, "/api/notifications/read-all", {}]]) {
  for (const origin of ["https://evil.example", "null", `${BASE}.evil.example`, "http://127.0.0.1:3211@evil.example"]) {
    const h = { cookie: who.cookieHeader(), origin, "content-type": "application/json" };
    const r = await fetch(BASE + path, { method: "POST", headers: h, body: JSON.stringify(body) });
    csrf.push({ who: who.name, origin, status: r.status, v: r.status === 403 || r.status === 401 ? "OK" : "FAIL" });
  }
  // text/plain and multipart cross-origin
  const r2 = await fetch(BASE + path, { method: "POST", headers: { cookie: who.cookieHeader(), origin: "https://evil.example", "content-type": "text/plain" }, body: "{}" });
  csrf.push({ who: who.name, origin: "evil + text/plain", status: r2.status, v: r2.status === 403 || r2.status === 401 ? "OK" : "FAIL" });
}
const up = await fetch(BASE + "/api/uploads", { method: "POST", headers: { cookie: intAc.cookieHeader(), origin: "https://evil.example", "content-type": "multipart/form-data; boundary=x" }, body: "--x--" });
csrf.push({ who: "intA", origin: "evil + multipart /api/uploads", status: up.status, v: up.status === 403 || up.status === 401 ? "OK" : "FAIL" });
// CORS preflight from a foreign origin.
const pre = await fetch(BASE + "/api/auth/me", { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
const cors = { status: pre.status, acao: pre.headers.get("access-control-allow-origin"), acac: pre.headers.get("access-control-allow-credentials") };

const fails = results.filter((r) => r.v === "FAIL").concat(csrf.filter((r) => r.v === "FAIL"));
const count = (v) => results.filter((r) => r.v === v).length;
console.log(JSON.stringify({ totals: { OK: count("OK"), FAIL: count("FAIL"), INCONCLUSIVE: count("INCONCLUSIVE"), ERROR: count("ERROR") }, enumRows, cors, cookieFlags: [...new Map(cookieFlags.map((c) => [c.name + c.who, c])).values()], csrfFails: csrf.filter((c) => c.v !== "OK"), headers: hdrs }, null, 1));
for (const r of results.filter((r) => r.v !== "OK")) console.log(`${r.v.padEnd(12)} ${r.status} ${r.who.padEnd(8)} ${r.method.padEnd(6)} ${r.path}  ${r.note}`);
await db.end();
process.exit(fails.length ? 1 : 0);
