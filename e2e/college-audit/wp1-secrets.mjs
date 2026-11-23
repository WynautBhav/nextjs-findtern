// WP1: secrets that must not reach a page or an RSC payload. The full bank account number and the drive token.
//  - TPO saves a bank account; the full number must be on no TPO page, no admin page, and only in the admin reveal (audited, no-store, money permission)
//  - the drive token appears once, in the create/reissue response; never on any page afterwards; the hash is never sent out
import { harness, loggedIn, sql } from "./wp1-lib.mjs";
import { STAFF, ensureFixture } from "./wp1-fixture.mjs";

const h = harness("wp1-secrets");
const F = await ensureFixture();
const tpoA = await loggedIn("college", "tpo@jklu.edu.in");
const sa = await loggedIn("admin", "admin@findtern.dev");
const staff = {};
for (const [k, s] of Object.entries(STAFF)) staff[k] = await loggedIn("admin", s.email);
const emp = await loggedIn("employer", "hiring@northwind.dev");

const NUMBER = "50100234567891";
// a pending withdrawal locks the bank form: clear any left by an earlier run
await sql("delete from college_payouts where college_id=$1 and status='requested'", [F.A.id]);
let r = await tpoA.req("PUT", "/api/college/bank", { json: { holder: "JKLU Placement Cell", bankName: "HDFC Bank", accountNumber: NUMBER, confirm: NUMBER, ifsc: "HDFC0001234" } });
h.check("bank.saved", r.status === 200 && r.json?.last4 === "7891" && !r.text.includes(NUMBER), `${r.status} ${r.text.slice(0, 80)}`);

for (const path of ["/college", "/college/earnings", "/college/seats", "/college/master-data"]) {
  const p = await tpoA.req("GET", path);
  h.check(`bank.number-not-on-tpo-page ${path}`, p.status === 200 && !p.text.includes(NUMBER), `${p.status}`);
}
for (const [who, c] of Object.entries({ super: sa, accounts: staff.accounts, admin: staff.admin })) {
  const p = await c.req("GET", `/admin/colleges/${F.A.id}`);
  h.check(`bank.number-not-in-admin-page ${who}`, p.status === 200 && !p.text.includes(NUMBER), `${p.status} ifsc-shown=${p.text.includes("HDFC0001234")}`);
}
const before = (await sql("select count(*)::int n from admin_audit_log where action='college.bank_reveal' and target_id=$1", [F.A.id]))[0].n;
r = await sa.req("POST", `/api/admin/colleges/${F.A.id}/bank`, { json: {} });
const after = (await sql("select count(*)::int n from admin_audit_log where action='college.bank_reveal' and target_id=$1", [F.A.id]))[0].n;
h.check("bank.reveal-audited-and-no-store", r.status === 200 && r.text.includes(NUMBER) && /no-store/.test(r.headers.get("cache-control") ?? "") && after === before + 1, `${r.status} audit ${before}->${after} cc=${r.headers.get("cache-control")}`);
for (const who of ["ops", "sales"]) {
  const x = await staff[who].req("POST", `/api/admin/colleges/${F.A.id}/bank`, { json: {} });
  h.check(`bank.reveal-denied-${who}`, x.status === 403 && !x.text.includes(NUMBER), `${x.status}`);
}
const acc = await staff.accounts.req("POST", `/api/admin/colleges/${F.A.id}/bank`, { json: {} });
h.check("bank.reveal-accounts-allowed-and-audited", acc.status === 200 && (await sql("select count(*)::int n from admin_audit_log where action='college.bank_reveal' and target_id=$1", [F.A.id]))[0].n === after + 1, `${acc.status}`);

// drive token
const day = 86400000;
const created = await tpoA.req("POST", "/api/college/drives", { json: { title: "Secrets drive", kind: "internship", startsAt: new Date(Date.now() - 3600000).toISOString(), endsAt: new Date(Date.now() + day).toISOString() } });
const token = created.json.url.split("/drive/")[1];
const [row] = await sql("select token_hash from college_drives where id=$1", [created.json.id]);
h.check("token.not-stored-only-hash", token.length >= 40 && row.token_hash !== token && row.token_hash.length === 64 && !(await sql("select 1 from college_drives where token_hash=$1", [token])).length, `token ${token.length} chars`);
for (const [who, c] of Object.entries({ tpo: tpoA, super: sa })) {
  for (const path of who === "tpo" ? [`/college/drives/${created.json.id}`, "/college/drives", "/college"] : [`/admin/colleges/${F.A.id}`]) {
    const p = await c.req("GET", path);
    h.check(`token.not-on-page ${who} ${path.replace(created.json.id, ":id")}`, p.status === 200 && !p.text.includes(token) && !p.text.includes(row.token_hash), `${p.status}`);
  }
}
const logs = await sql("select count(*)::int n from college_audit_log where meta::text like $1", [`%${token}%`]);
const alogs = await sql("select count(*)::int n from admin_audit_log where meta::text like $1", [`%${token}%`]);
h.check("token.not-in-audit-logs", logs[0].n === 0 && alogs[0].n === 0, "");
// the landing page: public, no student data, no referrer, noindex, 404 for a wrong or revoked-college token
const { Client } = await import("./wp1-lib.mjs");
const anon = new Client("anon");
const land = await anon.req("GET", `/drive/${token}`);
h.check("landing.public-no-student-names", land.status === 200 && !/@jklu|aarav|sharma/i.test(land.text) && /no-referrer/.test(land.text) && /noindex/.test(land.text), `${land.status} referrer=${/no-referrer/.test(land.text)} noindex=${/noindex/.test(land.text)}`);
const bad = await anon.req("GET", `/drive/${"x".repeat(43)}`);
h.check("landing.unknown-token-404", bad.status === 404, `${bad.status}`);
// employer API with the token: uniform 404 for unknown, 200 join, then revoke closes it again
const j = await emp.req("POST", "/api/drives/join", { json: { token } });
h.check("join.employer-ok", j.status === 200, `${j.status} ${j.text.slice(0, 60)}`);
const stu = await loggedIn("intern", F.studentA.email);
const sj = await stu.req("POST", "/api/drives/join", { json: { token } });
h.check("join.student-denied", sj.status === 403, `${sj.status}`);
const aj = await tpoA.req("POST", "/api/drives/join", { json: { token } });
h.check("join.college-officer-denied", aj.status === 403, `${aj.status}`);
const rev = await tpoA.req("DELETE", `/api/college/drives/${created.json.id}/link`);
const jr = await emp.req("GET", `/employer/drives/${created.json.id}`);
h.check("revoke.employer-locked-out", rev.status === 200 && !/@jklu/.test(jr.text), `${rev.status} page ${jr.status}`);
const re = await tpoA.req("POST", `/api/college/drives/${created.json.id}/link`);
const newTok = re.json.url.split("/drive/")[1];
const old = await anon.req("GET", `/drive/${token}`);
h.check("reissue.old-token-dead-new-token-live", old.status === 404 && (await anon.req("GET", `/drive/${newTok}`)).status === 200, `old ${old.status}`);
const oldJoin = await emp.req("POST", "/api/drives/join", { json: { token } });
h.check("reissue.old-token-cannot-join", oldJoin.status === 404, `${oldJoin.status}`);
await sql("delete from college_drive_employers where drive_id=$1", [created.json.id]);
await sql("delete from college_drives where id=$1", [created.json.id]);
h.done();
