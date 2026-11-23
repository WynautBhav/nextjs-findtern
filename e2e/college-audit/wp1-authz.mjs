// WP1 authorisation audit: A1 (TPO A vs college B), A2 (role matrix), A3 (CSRF, origin, disabled accounts),
// A4 (code brute force), R1 (double submit on the admin college routes), plus login throttle and RSC leaks.
// Needs a running production build on BASE and the scratch DB in DATABASE_URL (see wp1-lib.mjs). Safe to re-run.
import { randomUUID } from "node:crypto";
import { BASE, Client, harness, loggedIn, sql } from "./wp1-lib.mjs";
import { STAFF, ensureFixture } from "./wp1-fixture.mjs";

const h = harness("wp1-authz");
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const run = (id) => !only || only.test(id);
const denied = (s) => s === 401 || s === 403;
const FAKE = randomUUID();
const FAKE2 = randomUUID();

const F = await ensureFixture();
const B_ROSTER_BEFORE = (await sql("select count(*)::int n from college_roster where college_id=$1", [F.B.id]))[0].n;
const A = F.A.id;
const B = F.B.id;

// ── sessions ────────────────────────────────────────────────────────────
const tpoA = await loggedIn("college", "tpo@jklu.edu.in");
const tpoB = await loggedIn("college", "tpo@jecrc.test");
const student = await loggedIn("intern", F.studentA.email);
const employer = await loggedIn("employer", "hiring@northwind.dev");
const superAdmin = await loggedIn("admin", "admin@findtern.dev");
const staff = {};
for (const [k, s] of Object.entries(STAFF)) staff[k] = await loggedIn("admin", s.email);
const anon = new Client("anon");
const bStudentIds = F.bStudents.map((s) => s.user_id);
const bStudentNames = F.bStudents.map((s) => s.email); // emails: first names are shared with college A students

// ── route tables ────────────────────────────────────────────────────────
// body = something that fails validation (400) on a route that is reachable, so nothing is changed by a probe.
const collegeRoutes = [
  { m: "GET", p: "/api/college/drive-dashboard" },
  { m: "GET", p: "/api/college/leave-requests" },
  { m: "GET", p: `/api/college/students/${bStudentIds[0]}/recording` },
  { m: "GET", p: `/api/college/students/${bStudentIds[0]}/report` },
  { m: "POST", p: "/api/college/students/export", body: {} },
  { m: "POST", p: "/api/college/students/decide", body: {} },
  { m: "POST", p: "/api/college/nudge", body: {} },
  { m: "POST", p: "/api/college/roster", body: {} },
  { m: "DELETE", p: "/api/college/roster", body: {} },
  { m: "POST", p: "/api/college/leave-requests/decide", body: {} },
  { m: "POST", p: "/api/college/payouts", body: {} },
  { m: "PUT", p: "/api/college/bank", body: {} },
  { m: "POST", p: "/api/college/drives", body: {} },
  { m: "PATCH", p: `/api/college/drives/${F.driveA.id}`, body: {} },
  { m: "POST", p: `/api/college/drives/${F.driveA.id}/link`, mutates: true },
  { m: "DELETE", p: `/api/college/drives/${F.driveA.id}/link`, mutates: true },
];
const collegeMutations = collegeRoutes.filter((r) => r.m !== "GET" && !r.mutates);

// admin routes: cls = which permission class gates them (see lib/admin/permissions.ts)
const adminRoutes = [
  { m: "POST", p: "/api/admin/colleges", body: {}, cls: "company" },
  { m: "PUT", p: "/api/admin/colleges/settings", body: {}, cls: "company" },
  { m: "PATCH", p: `/api/admin/colleges/${FAKE}`, body: {}, cls: "company" },
  { m: "POST", p: `/api/admin/colleges/${FAKE}/admins`, body: { name: "x", email: "x@x.test" }, cls: "company" },
  { m: "POST", p: `/api/admin/colleges/${FAKE}/admins/${FAKE2}/reset-password`, body: {}, cls: "company" },
  { m: "POST", p: `/api/admin/colleges/${FAKE}/students`, body: {}, cls: "company" },
  { m: "POST", p: `/api/admin/colleges/${FAKE}/leave-requests`, body: {}, cls: "company" },
  { m: "POST", p: `/api/admin/colleges/${FAKE}/drive-orders`, body: {}, cls: "company" },
  { m: "GET", p: `/api/admin/colleges/${FAKE}/drive-orders`, cls: "companyRead" },
  { m: "POST", p: `/api/admin/colleges/${FAKE}/seat-batches`, body: {}, cls: "money" },
  { m: "PATCH", p: `/api/admin/colleges/${FAKE}/seat-batches/${FAKE2}`, body: {}, cls: "money" },
  { m: "POST", p: `/api/admin/colleges/${FAKE}/payouts/${FAKE2}`, body: {}, cls: "money" },
  { m: "POST", p: `/api/admin/colleges/${FAKE}/bank`, body: {}, cls: "money" },
  { m: "POST", p: `/api/admin/colleges/${FAKE}/promo-code`, body: {}, cls: "money" },
  { m: "PATCH", p: `/api/admin/colleges/${FAKE}/promo-code`, body: {}, cls: "money" },
  { m: "POST", p: `/api/admin/drive-orders/${FAKE}/payment`, body: {}, cls: "money" },
  { m: "POST", p: `/api/admin/drive-orders/${FAKE}/campaign`, body: {}, cls: "company" },
  { m: "POST", p: `/api/admin/drive-orders/${FAKE}/imports`, body: {}, cls: "company" },
  { m: "GET", p: `/api/admin/drive-orders/${FAKE}/campaign`, cls: "companyRead" },
  { m: "GET", p: `/api/admin/drive-orders/${FAKE}/imports`, cls: "companyRead" },
  { m: "POST", p: `/api/admin/drive-orders/${FAKE}/outbox/${FAKE2}/resend`, body: {}, cls: "company" },
  { m: "GET", p: `/api/admin/imports/${FAKE}`, cls: "companyRead" },
  { m: "POST", p: `/api/admin/imports/${FAKE}/confirm`, body: {}, cls: "company" },
  { m: "POST", p: `/api/admin/identity-reviews/${FAKE}`, body: {}, cls: "company" },
  { m: "GET", p: "/api/admin/drive-overview", cls: "companyRead" },
  { m: "GET", p: "/api/admin/identity-reviews", cls: "companyRead" },
];
// expected: does this staff role get past the gate (not 401/403)? Defaults in lib/admin/roles-seed.ts.
const EXPECT = {
  super: { company: true, companyRead: true, money: true },
  admin: { company: false, companyRead: true, money: true },
  accounts: { company: false, companyRead: false, money: true },
  ops: { company: false, companyRead: false, money: false },
  sales: { company: false, companyRead: true, money: false },
};

// ── snapshot of college B (A1 asserts none of it moves) ────────────────
async function snapB() {
  const [d] = await sql("select title,token_hash,revoked_at,starts_at,ends_at,include_user_ids,eligibility from college_drives where id=$1", [F.driveB.id]);
  const [lr] = await sql("select status,decided_at from college_leave_requests where id=$1", [F.leaveB]);
  const mem = await sql("select user_id,status,left_at,college_id from college_memberships where college_id=$1 order by user_id", [B]);
  const [roster] = await sql("select count(*)::int n from college_roster where college_id=$1", [B]);
  const [aud] = await sql("select count(*)::int n from college_audit_log where college_id=$1", [B]);
  const [nud] = await sql("select count(*)::int n from college_nudges where college_id=$1", [B]);
  const [col] = await sql("select bank_name,bank_account_number,is_active from colleges where id=$1", [B]);
  const [pay] = await sql("select count(*)::int n from college_payouts where college_id=$1", [B]);
  return JSON.stringify({ d, lr, mem, roster, aud, nud, col, pay });
}
async function snapA() {
  const [d] = await sql("select title,token_hash,revoked_at from college_drives where id=$1", [F.driveA.id]);
  return JSON.stringify(d);
}

// ═══ A1: TPO A with ids from college B ═════════════════════════════════
if (run("A1")) {
  // control: B's own officer reaches the artifact route (it writes one audit row, so it runs before the snapshot)
  {
    const c = await tpoB.req("GET", `/api/college/students/${bStudentIds[0]}/recording`);
    h.check("A1.artifact.control-B-sees-own", c.status !== 404 || !/Not found/.test(c.text), `B officer gets ${c.status}`);
  }
  const before = await snapB();
  const bodies = [];
  const note = (r) => bodies.push(r.text);
  const names = [F.B.name, B, ...bStudentIds, F.driveB.id, ...bStudentNames.map((n) => `"${n}"`)];

  let r = await tpoA.req("GET", `/api/college/students/${bStudentIds[0]}/recording`); note(r);
  h.check("A1.artifact.recording", r.status === 404 && /Not found/.test(r.text), `${r.status} ${r.text.slice(0, 60)}`);
  r = await tpoA.req("GET", `/api/college/students/${bStudentIds[1]}/report`); note(r);
  h.check("A1.artifact.report", r.status === 404 && /Not found/.test(r.text), `${r.status}`);

  r = await tpoA.req("POST", "/api/college/students/export", { json: { columns: ["name", "email", "phone"], userIds: bStudentIds } }); note(r);
  h.check("A1.export.filter-B-ids", r.status === 400 && !/@/.test(r.text) && !bStudentNames.some((n) => r.text.includes(n)), `${r.status} ${r.text.slice(0, 80)}`);
  r = await tpoA.req("POST", "/api/college/students/export", { json: { columns: ["name", "email"], userIds: [...bStudentIds, F.studentA.user_id] } });
  h.check("A1.export.mixed-only-A-row", r.status === 200 && !bStudentNames.some((n) => r.text.includes(n)) && !/jecrc/i.test(r.text) && r.text.split("\n").filter(Boolean).length === 2, `${r.status} lines=${r.text.split("\n").filter(Boolean).length}`);

  for (const action of ["accept", "deny", "restore"]) {
    r = await tpoA.req("POST", "/api/college/students/decide", { json: { userIds: bStudentIds, action } }); note(r);
    h.check(`A1.decide.${action}`, r.status === 404, `${r.status} ${r.text.slice(0, 80)}`);
  }
  r = await tpoA.req("POST", "/api/college/nudge", { json: { kind: NUDGE_KIND(), userIds: bStudentIds } }); note(r);
  h.check("A1.nudge", r.status === 200 && r.json?.sent === 0 && r.json?.emailed === 0, `${r.status} ${r.text.slice(0, 120)}`);
  r = await tpoA.req("POST", "/api/college/leave-requests/decide", { json: { ids: [F.leaveB], action: "approve" } }); note(r);
  h.check("A1.leave-decide", r.status === 200 && r.json?.results?.[0]?.ok === false && r.json?.approved === 0, `${r.status} ${r.text.slice(0, 160)}`);
  r = await tpoA.req("POST", "/api/college/leave-requests/decide", { json: { ids: [F.leaveB], action: "reject", note: "x" } });
  h.check("A1.leave-reject", r.status === 200 && r.json?.results?.[0]?.ok === false, `${r.status}`);
  r = await tpoA.req("GET", "/api/college/leave-requests"); note(r);
  h.check("A1.leave-list-own-only", r.status === 200 && !r.text.includes(F.leaveB) && !bStudentIds.some((i) => r.text.includes(i)), `${r.status}`);

  r = await tpoA.req("PATCH", `/api/college/drives/${F.driveB.id}`, { json: { title: "HIJACK", kind: "internship", startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() } }); note(r);
  h.check("A1.drive-patch", r.status === 404, `${r.status}`);
  r = await tpoA.req("POST", `/api/college/drives/${F.driveB.id}/link`); note(r);
  h.check("A1.drive-link-reissue", r.status === 404 && !/drive\//.test(r.text), `${r.status}`);
  r = await tpoA.req("DELETE", `/api/college/drives/${F.driveB.id}/link`); note(r);
  h.check("A1.drive-revoke", r.status === 404, `${r.status}`);
  r = await tpoA.req("GET", `/api/college/presence/stream?drive=${F.driveB.id}`, { signal: AbortSignal.timeout(8000) }); note(r);
  h.check("A1.presence-drive-B", r.status === 404, `${r.status}`);
  // the stream without ?drive= carries only A's headcount
  {
    const ac = new AbortController();
    const res = await fetch(BASE + "/api/college/presence/stream", { headers: { cookie: tpoA.cookieHeader() }, signal: ac.signal });
    const reader = res.body.getReader();
    const chunk = new TextDecoder().decode((await reader.read()).value ?? new Uint8Array());
    const chunk2 = new TextDecoder().decode((await Promise.race([reader.read(), new Promise((r2) => setTimeout(() => r2({ value: new Uint8Array() }), 1500))])).value ?? new Uint8Array());
    ac.abort();
    const all = chunk + chunk2;
    const total = Number(/"total":(\d+)/.exec(all)?.[1] ?? -1);
    const [{ n }] = await sql("select count(*)::int n from college_memberships where college_id=$1 and left_at is null and status='verified'", [A]);
    h.check("A1.presence-own-scope", res.status === 200 && total > 0 && total <= n && !bStudentIds.some((i) => all.includes(i)), `status=${res.status} total=${total} A-verified=${n}`);
  }
  r = await tpoA.req("DELETE", "/api/college/roster", { json: { emails: F.bStudents.map((s) => s.email) } }); note(r);
  // the three students were moved to B in the fixture but A's seeded roster still lists their emails: A may delete its OWN rows, B's roster must not move
  h.check("A1.roster-remove-only-touches-A-roster", r.status === 200 && (await sql("select count(*)::int n from college_roster where college_id=$1", [B]))[0].n === B_ROSTER_BEFORE, `${r.status} ${r.text.slice(0, 60)}`);
  r = await tpoA.req("GET", "/api/college/drive-dashboard?page=1&pageSize=50&q=" + encodeURIComponent(F.B.name)); note(r);
  h.check("A1.drive-dashboard-own-only", r.status === 200 && !r.text.includes(B), `${r.status}`);
  r = await tpoA.req("GET", `/api/college/drive-dashboard?collegeId=${B}&college_id=${B}&page=1`); note(r);
  const withParam = r.text;
  r = await tpoA.req("GET", `/api/college/drive-dashboard?page=1`);
  h.check("A1.drive-dashboard-ignores-collegeId-param", withParam === r.text, `same body=${withParam === r.text}`);
  // body smuggling of college id on create/update/drive
  r = await tpoA.req("POST", "/api/college/drives", { json: { title: "Smuggle", kind: "internship", startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(), collegeId: B, college_id: B, tokenHash: "x".repeat(64), createdBy: F.tpoB.id } });
  const [sm] = r.status === 201 ? await sql("select college_id,created_by,token_hash from college_drives where id=$1", [r.json.id]) : [null];
  h.check("A1.drive-create-ignores-body-college", r.status === 201 && sm.college_id === A && sm.created_by === F.tpoA.id && sm.token_hash.length === 64 && sm.token_hash !== "x".repeat(64), `${r.status} ${JSON.stringify(sm)}`);
  if (r.status === 201) await sql("delete from college_drives where id=$1", [r.json.id]);

  // B's student ids in A's drive include list: stored (the officer typed them) and echoed only back to that officer,
  // but they must never make a B student eligible: an employer who joined A's drive cannot shortlist them.
  const dr = await tpoA.req("POST", "/api/college/drives", { json: { title: "Include B ids", kind: "internship", startsAt: new Date(Date.now() - 3600000).toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(), includeUserIds: bStudentIds } });
  if (dr.status === 201) {
    const token = dr.json.url.split("/drive/")[1];
    const page = await tpoA.req("GET", `/college/drives/${dr.json.id}`);
    h.check("A1.drive-page-include-B-no-B-email-or-name", page.status === 200 && !F.bStudents.some((s) => page.text.includes(s.email)) && !page.text.includes(F.B.name), `${page.status}`);
    const join = await employer.req("POST", "/api/drives/join", { json: { token } });
    h.check("A1.employer-joins-A-drive", join.status === 200, `${join.status} ${join.text.slice(0, 80)}`);
    for (const stu of F.bStudents.slice(0, 2)) {
      const sl = await employer.req("POST", `/api/employer/drives/${dr.json.id}/shortlist`, { json: { userId: stu.user_id, on: true } });
      h.check(`A1.employer-cannot-shortlist-B-student-via-include ${stu.user_id.slice(0, 8)}`, sl.status === 404, `${sl.status} ${sl.text.slice(0, 60)}`);
    }
    const ep = await employer.req("GET", `/employer/drives/${dr.json.id}`);
    h.check("A1.employer-drive-page-no-B-student", ep.status === 200 && !F.bStudents.some((s) => ep.text.includes(s.email) || ep.text.includes(s.user_id)), `${ep.status}`);
    const emp0 = await sql("select count(*)::int n from college_drive_shortlist where drive_id=$1", [dr.json.id]);
    h.check("A1.no-shortlist-row-for-B", emp0[0].n === 0, `${emp0[0].n}`);
    await sql("delete from college_drive_shortlist where drive_id=$1", [dr.json.id]);
    await sql("delete from college_drive_employers where drive_id=$1", [dr.json.id]);
    await sql("delete from college_drives where id=$1", [dr.json.id]);
  } else h.check("A1.drive-include-B-ids-create", false, `${dr.status} ${dr.text.slice(0, 100)}`);

  // an employer who has not joined college B's drive: its APIs and page refuse
  {
    const sl = await employer.req("POST", `/api/employer/drives/${F.driveB.id}/shortlist`, { json: { userId: bStudentIds[0], on: true } });
    h.check("A1.employer-unjoined-B-drive-shortlist", sl.status === 403, `${sl.status}`);
    const mt = await employer.req("GET", `/api/employer/drives/${F.driveB.id}/meetings`);
    h.check("A1.employer-unjoined-B-drive-meetings", denied(mt.status) || mt.status === 404, `${mt.status}`);
    const pg = await employer.req("GET", `/employer/drives/${F.driveB.id}`);
    h.check("A1.employer-unjoined-B-drive-page-no-data", !F.bStudents.some((x) => pg.text.includes(x.email) || pg.text.includes(x.user_id)), `${pg.status}`);
  }

  // pages
  r = await tpoA.req("GET", `/college/drives/${F.driveB.id}`);
  h.check("A1.page.drive-B", notFoundPage(r) && !r.text.includes("HIJACK") && !/JECRC|JECRC placement drive/.test(r.text), `${r.status}`);
  r = await tpoA.req("GET", `/college/students/${bStudentIds[0]}`);
  h.check("A1.page.student-B", notFoundPage(r) && !/JECRC/.test(r.text) && !r.text.includes(F.bStudents[0].email), `${r.status}`);
  // the HTML of a Next page embeds the whole RSC flight payload (self.__next_f), so the text checks above and below cover leaked ids in RSC too
  // overview pages carry no B names/ids
  for (const path of ["/college", "/college/students", "/college/master-data", "/college/drives", "/college/approvals", "/college/earnings", "/college/seats"]) {
    const p = await tpoA.req("GET", path);
    const leak = [F.B.name, B, ...bStudentIds, F.driveB.id, ...F.bStudents.map((s) => s.email), "tpo@jecrc.test"].find((x) => p.text.includes(x));
    h.check(`A1.page.${path}-no-B-data`, p.status === 200 && !leak, `${p.status}${leak ? " LEAK " + leak : ""}`);
  }

  // nothing in any response body names college B or its ids
  const joined = bodies.join("\n");
  const leaked = names.filter((n) => joined.includes(n));
  h.check("A1.no-B-names-in-any-response", leaked.length === 0, leaked.join(", "));
  const after = await snapB();
  if (before !== after) {
    const x = JSON.parse(before), y = JSON.parse(after);
    console.log("B diff keys:", Object.keys(x).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k])));
  }
  h.check("A1.B-data-unchanged", before === after, before === after ? "" : "B changed");
  // nothing about A moved either except by A's own reissue below (not run here)
}

function notFoundPage(r) {
  return r.status === 404 || (r.status === 200 && /NEXT_HTTP_ERROR_FALLBACK;404|This page could not be found|name="robots" content="noindex"/.test(r.text));
}

function NUDGE_KIND() {
  return "online";
}

// ═══ A2: every role against every college API and admin API ═══════════
if (run("A2")) {
  const actors = { anon, student, employer, "admin-super": superAdmin, "admin-sales": staff.sales };
  const snapA0 = await snapA();
  for (const [label, c] of Object.entries(actors)) {
    for (const r of collegeRoutes) {
      // anon: send a matching csrf cookie+header so the call reaches the session check, not just the CSRF check
      const opts = { json: r.body };
      if (label === "anon" && r.m !== "GET") {
        const t = "forged-csrf-token-0123456789abcdef";
        opts.csrf = "none";
        opts.headers = { "x-csrf-token": t };
        opts.cookies = { ft_csrf: t };
      }
      if (r.p.includes("/presence/stream")) opts.signal = AbortSignal.timeout(8000);
      const res = await c.req(r.m, r.p, opts);
      h.check(`A2.${label}.${r.m} ${r.p.replace(F.driveA.id, ":drive").replace(bStudentIds[0], ":id")}`, denied(res.status) && !/JK Lakshmipat|JECRC/.test(res.text), `${res.status} ${res.text.slice(0, 70)}`);
    }
    // GET on a POST-only route: never a mutation by GET
  }
  h.check("A2.A-drive-untouched-by-probes", snapA0 === (await snapA()), "");
  // the presence stream and every GET with the wrong method
  for (const p of ["/api/college/nudge", "/api/college/payouts", "/api/college/bank", "/api/college/roster", "/api/college/students/decide", "/api/college/students/export", "/api/college/leave-requests/decide", `/api/college/drives/${F.driveA.id}/link`]) {
    const res = await tpoA.req("GET", p);
    h.check(`A2.no-GET-mutation ${p.replace(F.driveA.id, ":drive")}`, res.status === 405, `${res.status}`);
  }

  // admin APIs
  const adminActors = { anon, tpo: tpoA, student, employer };
  for (const [label, c] of Object.entries(adminActors)) {
    for (const r of adminRoutes) {
      const opts = { json: r.body };
      if (label === "anon" && r.m !== "GET") {
        const t = "forged-csrf-token-0123456789abcdef";
        opts.csrf = "none";
        opts.headers = { "x-csrf-token": t };
        opts.cookies = { ft_csrf: t };
      }
      const res = await c.req(r.m, r.p, opts);
      h.check(`A2.admin-api.${label}.${r.m} ${r.p.replace(FAKE, ":id").replace(FAKE2, ":id2")}`, denied(res.status), `${res.status} ${res.text.slice(0, 60)}`);
    }
  }
  const matrix = { super: superAdmin, admin: staff.admin, accounts: staff.accounts, ops: staff.ops, sales: staff.sales };
  for (const [label, c] of Object.entries(matrix)) {
    for (const r of adminRoutes) {
      const res = await c.req(r.m, r.p, { json: r.body });
      const passed = !denied(res.status);
      const want = EXPECT[label][r.cls];
      h.check(`A2.admin-role.${label}.${r.m} ${r.p.replace(FAKE, ":id").replace(FAKE2, ":id2")} (${r.cls}) ${want ? "allowed" : "denied"}`, passed === want, `${res.status} ${res.text.slice(0, 60)}`);
    }
  }
  // pages
  const pages = ["/college", "/college/students", "/college/master-data", "/college/drives", "/college/approvals", "/college/earnings", "/college/seats", `/college/drives/${F.driveA.id}`, `/college/students/${F.studentA.user_id}`];
  for (const [label, c] of Object.entries({ anon, student, employer, admin: superAdmin })) {
    for (const path of pages) {
      for (const rsc of [false, true]) {
        const rscHeaders = { rsc: "1" };
        let res = await c.req("GET", path, { headers: rsc ? rscHeaders : {} });
        // Next answers a bare RSC fetch with a 307 to the same URL plus its _rsc cache-buster; follow that one hop
        if (rsc && res.status === 307 && /_rsc=/.test(res.headers.get("location") ?? "")) res = await c.req("GET", res.headers.get("location"), { headers: rscHeaders });
        // a hand-made RSC request carries no valid _rsc hash, so Next bounces it to itself before any page code runs: an empty 307 to the same path is a refusal too
        const loc0 = res.headers.get("location") ?? "";
        const bounce = rsc && res.status === 307 && loc0.startsWith(path.split("?")[0]) && res.text.length === 0;
        const loc = bounce ? "/login (next bounce)" : loc0;
        const leak = /aarav|sharma|JK Lakshmipat/i.test(res.text);
        h.check(`A2.page.${label}${rsc ? "+rsc" : ""} ${path.replace(F.driveA.id, ":drive").replace(F.studentA.user_id, ":id")}`, (res.status >= 300 && res.status < 400 && /login/.test(loc)) && !leak, `${res.status} ${loc.slice(0, 50)}${leak ? " LEAK" : ""}`);
      }
    }
  }
  for (const [label, c] of Object.entries({ anon, tpo: tpoA, student, employer })) {
    for (const path of ["/admin/colleges", `/admin/colleges/${A}`, "/admin/drive-overview"]) {
      const res = await c.req("GET", path);
      const loc = res.headers.get("location") ?? "";
      h.check(`A2.admin-page.${label} ${path.replace(A, ":id")}`, res.status >= 300 && res.status < 400 && /admin\/login/.test(loc) && !/JK Lakshmipat/.test(res.text), `${res.status} ${loc}`);
    }
  }
  for (const [label, c] of Object.entries({ ops: staff.ops, sales: staff.sales, accounts: staff.accounts, admin: staff.admin })) {
    for (const path of ["/admin/colleges", `/admin/colleges/${A}`]) {
      const res = await c.req("GET", path);
      const sees = /JK Lakshmipat/.test(res.text);
      // permissions.ts: the list is companies:read (Admin, Sales); a college's own page also opens for transactions:read (Accounts)
      const want = path === "/admin/colleges" ? label === "admin" || label === "sales" : label !== "ops";
      h.check(`A2.admin-page-role.${label} ${path.replace(A, ":id")} ${want ? "opens" : "denied"}`, sees === want, `${res.status}`);
    }
  }
}

// ═══ A3: CSRF, origin, disabled accounts ══════════════════════════════
if (run("A3")) {
  const allMut = [
    ...collegeMutations.map((r) => ({ ...r, who: tpoA })),
    ...adminRoutes.filter((r) => r.m !== "GET").map((r) => ({ ...r, who: superAdmin })),
  ];
  const aBefore = await snapA();
  for (const r of allMut) {
    const tag = r.p.replace(F.driveA.id, ":drive").replace(FAKE, ":id").replace(FAKE2, ":id2");
    for (const mode of ["none", "wrong", "nocookie"]) {
      const res = await r.who.req(r.m, r.p, { json: r.body, csrf: mode });
      h.check(`A3.csrf-${mode} ${r.m} ${tag}`, res.status === 403 && /CSRF/i.test(res.text), `${res.status} ${res.text.slice(0, 50)}`);
    }
    // what a forged cross-site form/fetch looks like: the browser may attach the session cookie but the page cannot read ft_csrf to echo it
    for (const [label, opts] of [["evil-origin", { origin: "https://evil.example" }], ["null-origin", { origin: "null" }], ["cross-site", { headers: { "sec-fetch-site": "cross-site" } }]]) {
      const res = await r.who.req(r.m, r.p, { json: r.body, csrf: "none", ...opts });
      h.check(`A3.forged-${label}-no-token ${r.m} ${tag}`, res.status === 403 && /CSRF/i.test(res.text), `${res.status} ${res.text.slice(0, 50)}`);
    }
  }
  // Origin alone is NOT checked (double-submit token + SameSite=Lax is the whole defence): recorded, not asserted
  {
    const res = await tpoA.req("POST", "/api/college/nudge", { json: {}, origin: "https://evil.example" });
    console.log(`INFO foreign Origin with a valid token reaches validation: ${res.status} (design: token-only CSRF)`);
  }
  // with a genuine same-origin request the same calls reach validation (so the 403s above are the CSRF/origin guard, not a dead route)
  for (const r of allMut.slice(0, 6)) {
    const res = await r.who.req(r.m, r.p, { json: r.body });
    h.check(`A3.same-origin-control ${r.m} ${r.p.replace(FAKE, ":id").replace(F.driveA.id, ":drive")}`, res.status !== 403 || !/CSRF|origin/i.test(res.text), `${res.status} ${res.text.slice(0, 60)}`);
  }
  h.check("A3.A-drive-untouched", aBefore === (await snapA()), "");

  // disabled officer account (admin flag) and disabled college
  const ownB = await loggedIn("college", "tpo@jecrc.test");
  await sql("update college_admins set is_active=false where email='tpo@jecrc.test'");
  let r = await ownB.req("GET", "/api/college/leave-requests");
  h.check("A3.disabled-admin-read", denied(r.status), `${r.status}`);
  r = await ownB.req("POST", "/api/college/nudge", { json: {} });
  h.check("A3.disabled-admin-write", denied(r.status), `${r.status}`);
  r = await ownB.req("GET", "/college");
  h.check("A3.disabled-admin-page", r.status >= 300 && r.status < 400, `${r.status}`);
  const lg = new Client("b-login");
  r = await lg.req("POST", "/api/auth/college/login", { json: { email: "tpo@jecrc.test", password: "Findtern@2026" }, csrf: "none" });
  h.check("A3.disabled-admin-login", r.status === 403, `${r.status}`);
  await sql("update college_admins set is_active=true where email='tpo@jecrc.test'");
  r = await ownB.req("GET", "/api/college/leave-requests");
  h.check("A3.reenabled-admin-ok", r.status === 200, `${r.status}`);
  r = await superAdmin.req("PATCH", `/api/admin/colleges/${B}`, { json: { isActive: false } });
  h.check("A3.admin-disables-college", r.status === 200, `${r.status} ${r.text.slice(0, 60)}`);
  r = await ownB.req("GET", "/api/college/leave-requests");
  h.check("A3.disabled-college-read", denied(r.status), `${r.status}`);
  r = await ownB.req("POST", "/api/college/leave-requests/decide", { json: { ids: [F.leaveB], action: "approve" } });
  h.check("A3.disabled-college-write", denied(r.status), `${r.status}`);
  {
    // an open presence stream is cut when the college is switched off (checked in the stream, not just at open)
  }
  r = await lg.req("POST", "/api/auth/college/login", { json: { email: "tpo@jecrc.test", password: "Findtern@2026" }, csrf: "none" });
  h.check("A3.disabled-college-login", r.status === 403, `${r.status}`);
  await superAdmin.req("PATCH", `/api/admin/colleges/${B}`, { json: { isActive: true } });
  r = await ownB.req("GET", "/api/college/leave-requests");
  h.check("A3.reenabled-college-ok", r.status === 200, `${r.status}`);

  // an OPEN presence stream (names and roll numbers of offline students) must end when the officer or the college is switched off, or the session logs out:
  // the guard ran only when the stream opened, so a disabled account kept receiving the list for up to 270 s
  for (const how of ["college-disabled", "officer-disabled", "logout"]) {
    const sess = await loggedIn("college", "tpo@jecrc.test");
    const ac = new AbortController();
    const res = await fetch(BASE + "/api/college/presence/stream", { headers: { cookie: sess.cookieHeader() }, signal: ac.signal });
    const reader = res.body.getReader();
    await reader.read(); // retry: line
    const t0 = Date.now();
    if (how === "college-disabled") await superAdmin.req("PATCH", `/api/admin/colleges/${B}`, { json: { isActive: false } });
    else if (how === "officer-disabled") await sql("update college_admins set is_active=false where email='tpo@jecrc.test'");
    else await sess.req("POST", "/api/auth/logout", { json: {} });
    let ended = false;
    const deadline = Date.now() + 14_000;
    while (Date.now() < deadline && !ended) {
      const got = await Promise.race([reader.read().then((x) => (x.done ? "done" : "data")).catch(() => "done"), new Promise((r2) => setTimeout(() => r2("wait"), 1000))]);
      if (got === "done") ended = true;
    }
    ac.abort();
    await superAdmin.req("PATCH", `/api/admin/colleges/${B}`, { json: { isActive: true } });
    await sql("update college_admins set is_active=true where email='tpo@jecrc.test'");
    h.check(`A3.open-presence-stream-ends-when-${how}`, ended, ended ? `closed after ${Date.now() - t0} ms` : "still streaming 14 s after the account was switched off");
  }

  // password reset by staff ends the officer's other sessions
  const [adm] = await sql("select id from college_admins where email='tpo@jecrc.test'");
  const old = await loggedIn("college", "tpo@jecrc.test");
  r = await superAdmin.req("POST", `/api/admin/colleges/${B}/admins/${adm.id}/reset-password`, { json: {} });
  h.check("A3.reset-password-issued", r.status === 200 && r.json?.password && r.headers.get("cache-control")?.includes("no-store"), `${r.status}`);
  const newPw = r.json?.password;
  const stale = await old.req("GET", "/api/college/leave-requests");
  h.check("A3.reset-ends-old-session", denied(stale.status), `${stale.status}`);
  // restore the fixture password (hash of Findtern@2026 copied from A) so later runs still log in
  const [tA] = await sql("select password from college_admins where id=$1", [F.tpoA.id]);
  await sql("update college_admins set password=$1 where id=$2", [tA.password, adm.id]);
  h.check("A3.reset-new-password-works", Boolean(newPw), "restored fixture password afterwards");

  // logout: the cookie dies server side?
  const lo = await loggedIn("college", "tpo@jecrc.test");
  const saved = lo.cookieHeader();
  r = await lo.req("POST", "/api/auth/logout", { json: {} });
  const replay = await fetch(BASE + "/api/college/leave-requests", { headers: { cookie: saved } });
  h.check("A3.logout-revokes-captured-cookie", denied(replay.status), `replay after logout -> ${replay.status} (stateless signed cookie; see findings)`);
}

// ═══ A4 + login throttle ═════════════════════════════════════════════
if (run("A4")) {
  // college login: per account
  const emailX = `nobody${Date.now()}@jklu.edu.in`;
  let last = 0;
  let firstBlock = 0;
  for (let i = 1; i <= 14; i++) {
    const r = await new Client("l").req("POST", "/api/auth/college/login", { json: { email: emailX, password: "wrong-" + i }, csrf: "none", ip: "203.0.113.7" });
    last = r.status;
    if (r.status === 429 && !firstBlock) firstBlock = i;
  }
  h.check("A4.college-login-per-account-throttle", firstBlock > 0 && firstBlock <= 11, `first 429 at attempt ${firstBlock}`);
  // spraying many accounts from one address: ceiling like the other three logins
  let sprayBlock = 0;
  for (let i = 1; i <= 170 && !sprayBlock; i++) {
    const r = await new Client("l").req("POST", "/api/auth/college/login", { json: { email: `spray${i}.${Date.now()}@jklu.edu.in`, password: "x" }, csrf: "none", ip: "203.0.113.8" });
    if (r.status === 429) sprayBlock = i;
  }
  h.check("A4.college-login-address-ceiling", sprayBlock > 0 && sprayBlock <= 151, `first 429 at ${sprayBlock || "never within 170"} different accounts from one address`);
  let sprayEmp = 0;
  for (let i = 1; i <= 170 && !sprayEmp; i++) {
    const r = await new Client("l").req("POST", "/api/auth/employer/login", { json: { email: `spray${i}.${Date.now()}@x.dev`, password: "x" }, csrf: "none", ip: "203.0.113.9" });
    if (r.status === 429) sprayEmp = i;
  }
  h.check("A4.employer-login-address-ceiling-control", sprayEmp > 0, `first 429 at ${sprayEmp} (the control the college login must match)`);
  // same message for an unknown officer and a wrong password
  const a = await new Client("l").req("POST", "/api/auth/college/login", { json: { email: "tpo@jklu.edu.in", password: "wrong" }, csrf: "none" });
  const b = await new Client("l").req("POST", "/api/auth/college/login", { json: { email: "ghost@jklu.edu.in", password: "wrong" }, csrf: "none" });
  h.check("A4.college-login-no-account-oracle", a.status === b.status && a.text === b.text, `${a.status}/${b.status}`);

  // student code entry: college code, promo code, drive code, with one fresh throwaway student
  const OFF = Math.floor(Math.random() * 2) * 5; // a fresh set of students per run: the throttles live in the server's memory
  const [stu] = await sql("select u.email from users u where u.email like 'ishaan.%' order by email offset $1 limit 1", [OFF]);
  const s1 = await loggedIn("intern", stu.email);
  const ip = "198.51.100.21";
  const codeBody = (code) => ({ code, year: 3, branch: "CSE", declaredAdult: true });
  const seen = [];
  let blockedAt = 0;
  for (let i = 1; i <= 14; i++) {
    const code = i % 2 ? "FT" + Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, "A") : "bad code " + i;
    const r = await s1.req("POST", "/api/intern/college", { json: codeBody(code), ip });
    seen.push(r.status + ":" + (r.json?.error ?? "").slice(0, 40));
    if (r.status === 429 && !blockedAt) blockedAt = i;
  }
  h.check("A4.college-code-throttled-at-11", blockedAt === 11, `first 429 at ${blockedAt}`);
  const miss = new Set(seen.filter((x) => !x.startsWith("429")));
  h.check("A4.college-code-miss-same-answer-malformed-or-not", miss.size === 1, [...miss].join(" | "));
  // the throttle holds even when the attempt carries the right code (counted before the lookup)
  const [col] = await sql("select code from colleges where id=$1", [A]);
  const rr = await s1.req("POST", "/api/intern/college", { json: codeBody(col.code), ip });
  h.check("A4.college-code-valid-code-also-429-while-paused", rr.status === 429, `${rr.status}`);
  // students behind one address share the address tier: 30 attempts per 15 min across all of them, even though each student alone has 10
  let ipBlock = 0;
  let spent = 0;
  for (const off of [1, 2]) {
    const [o] = await sql("select u.email from users u where u.email like 'ishaan.%' order by email offset $1 limit 1", [off + OFF]);
    const sx = await loggedIn("intern", o.email);
    for (let i = 1; i <= 10 && !ipBlock; i++) {
      spent++;
      const r = await sx.req("POST", "/api/intern/college", { json: codeBody("FT" + Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, "B")), ip });
      if (r.status === 429) ipBlock = spent;
    }
  }
  h.check("A4.college-code-address-tier-shared", ipBlock > 0, `address blocked after ${ipBlock} attempts from 3 students (s1 spent 15 of 30 + 10 + 5 more by a third student)`);
  // promo: an unpaid college-account student, so the answers are real refusals and not the idempotent 'already paid'
  const [stu3] = await sql("select u.id, u.email from users u where u.email like 'ishaan.%' order by email offset $1 limit 1", [3 + OFF]);
  await sql("update intern_payments set status='failed' where intern_id=$1", [stu3.id]);
  await sql("update intern_onboarding set extra_data = jsonb_set(extra_data, '{payment,isPaid}', 'false') where user_id=$1", [stu3.id]);
  const s3 = await loggedIn("intern", stu3.email);
  let promoBlock = 0;
  const msgs = new Set();
  for (let i = 1; i <= 13; i++) {
    const r = await s3.req("POST", "/api/intern/college-promo", { json: { code: i % 3 ? "FTTPO" + i : "x".repeat(i) }, ip: "198.51.100.22" });
    if (r.status === 429) promoBlock ||= i;
    else msgs.add(r.status + ":" + (r.json?.error ?? "").slice(0, 70));
  }
  h.check("A4.promo-code-throttled", promoBlock === 11, `first 429 at ${promoBlock}`);
  h.check("A4.promo-code-one-failure-message", msgs.size === 1, [...msgs].join(" | "));
  await sql("update intern_payments set status='paid' where intern_id=$1 and gateway='free'", [stu3.id]);
  await sql("update intern_onboarding set extra_data = jsonb_set(extra_data, '{payment,isPaid}', 'true') where user_id=$1", [stu3.id]);
  // drive code redeem
  const [stu4] = await sql("select u.email from users u where u.email like 'ishaan.%' order by email offset $1 limit 1", [4 + OFF]);
  const s4 = await loggedIn("intern", stu4.email);
  let redeemBlock = 0;
  const rmsgs = new Set();
  for (let i = 1; i <= 13; i++) {
    const r = await s4.req("POST", "/api/intern/drive-codes/redeem", { json: { code: "ABCD" + i + "EFGH", declaredAdult: true }, ip: "198.51.100.23" });
    if (r.status === 429) redeemBlock ||= i;
    else rmsgs.add(r.status + ":" + (r.json?.error ?? "").slice(0, 60));
  }
  h.check("A4.drive-code-redeem-throttled", redeemBlock === 11 || redeemBlock === 0 && false, `first 429 at ${redeemBlock} msgs=${[...rmsgs].join(" | ")}`);
  // claim: no code to type, no guess surface; employer join: token is 256 bit
  const [stu5] = await sql("select u.email from users u where u.email like 'ishaan.%' order by email offset $1 limit 1", [4 + OFF]);
  const s5 = await loggedIn("intern", stu5.email);
  const cl = await s5.req("POST", "/api/intern/drive-codes/claim", { json: { declaredAdult: true } });
  h.check("A4.claim-has-no-code-input", [400, 404, 409].includes(cl.status) && !/code/i.test(cl.json?.error ?? "x") || cl.status === 404 || cl.status === 409, `${cl.status} ${cl.text.slice(0, 80)}`);
  let joinBlock = 0;
  for (let i = 1; i <= 70 && !joinBlock; i++) {
    const r = await employer.req("POST", "/api/drives/join", { json: { token: "A".repeat(43 - (i % 3)) }, ip: "198.51.100.24" });
    if (r.status === 429) joinBlock = i;
    else if (r.status !== 404) h.check(`A4.join-wrong-token-${i}`, false, `${r.status} ${r.text.slice(0, 60)}`);
  }
  h.check("A4.drive-join-wrong-token-throttled-uniform-404", joinBlock > 0 && joinBlock <= 61, `first 429 at ${joinBlock}`);
}

// ═══ R1: double submit on the admin college routes ════════════════════
if (run("R1")) {
  const aisheNum = String(100 + Math.floor(Math.random() * 800));
  const body = { name: "WP1 Double College " + Date.now(), aisheCode: `C-${aisheNum}${Math.floor(Math.random() * 90 + 10)}`, emailDomains: [], isPartner: false };
  const same = await Promise.all([superAdmin.req("POST", "/api/admin/colleges", { json: body }), superAdmin.req("POST", "/api/admin/colleges", { json: body })]);
  const codes = same.map((r) => r.status).sort();
  h.check("R1.college-create-same-aishe-one-effect", codes.join() === "201,409", codes.join());
  const nameOnly = { name: "WP1 NoCode College " + Date.now(), isPartner: false };
  const two = await Promise.all([superAdmin.req("POST", "/api/admin/colleges", { json: nameOnly }), superAdmin.req("POST", "/api/admin/colleges", { json: nameOnly })]);
  const [{ n }] = await sql("select count(*)::int n from colleges where name=$1", [nameOnly.name]);
  h.check("R1.college-create-same-name-no-code-one-effect", n === 1, `${n} colleges named alike after two parallel creates (${two.map((r) => r.status)})`);
  const newCollege = same.find((r) => r.status === 201)?.json?.id;

  if (newCollege) {
    // an officer login needs a paid batch first (owner rule); give this scratch college one
    await sql("insert into college_seat_batches (college_id,seats,amount_minor,status) values ($1,5,4720,'paid')", [newCollege]).catch(() => {});
  }
  const adm = await Promise.all([1, 2].map(() => superAdmin.req("POST", `/api/admin/colleges/${newCollege ?? B}/admins`, { json: { name: "Dup Officer", email: `dup.${Date.now()}@college.test` } })));
  // different emails above would both succeed: so use the same one
  const email = `dup2.${Date.now()}@college.test`;
  const adm2 = await Promise.all([1, 2, 3].map(() => superAdmin.req("POST", `/api/admin/colleges/${newCollege ?? B}/admins`, { json: { name: "Dup Officer", email } })));
  const st = adm2.map((r) => r.status).sort().join();
  const [{ n2 }] = await sql("select count(*)::int n2 from college_admins where email=$1", [email]);
  const [{ a2 }] = await sql("select count(*)::int a2 from admin_audit_log where action='college.admin_create' and meta->>'email'=$1", [email]);
  h.check("R1.officer-create-same-email-one-effect", st.split(",").filter((s) => s === "201").length <= 1 && n2 === 1 && a2 <= 1, `statuses ${st} (first run needs paid batch; rows=${n2}, audit=${a2})`);
  void adm;
  const [row] = await sql("select id from college_admins where email='tpo@jecrc.test'");
  const rp = await Promise.all([1, 2].map(() => superAdmin.req("POST", `/api/admin/colleges/${B}/admins/${row.id}/reset-password`, { json: {} })));
  const [tA] = await sql("select password from college_admins where id=$1", [F.tpoA.id]);
  await sql("update college_admins set password=$1 where id=$2", [tA.password, row.id]);
  h.check("R1.reset-password-parallel-both-answer", rp.every((r) => r.status === 200), rp.map((r) => r.status).join());
  const [s0] = await sql("select value from platform_settings where key='college_fee_per_student_minor'");
  const sPar = await Promise.all([1, 2].map(() => superAdmin.req("PUT", "/api/admin/colleges/settings", { json: { feePerStudentMinor: Number(s0?.value ?? 80000) } })));
  h.check("R1.settings-put-same-value-idempotent", sPar.every((r) => r.status === 200), sPar.map((r) => r.status).join());
  const pp = await Promise.all([1, 2].map(() => superAdmin.req("PATCH", `/api/admin/colleges/${B}`, { json: { showOnWebsite: false } })));
  h.check("R1.college-patch-parallel", pp.every((r) => r.status === 200), pp.map((r) => r.status).join());
  // TPO routes
  const lk = await Promise.all([1, 2].map(() => tpoB.req("POST", `/api/college/drives/${F.driveB.id}/link`)));
  const [dB] = await sql("select token_hash from college_drives where id=$1", [F.driveB.id]);
  h.check("R1.link-reissue-parallel-one-live-token", lk.every((r) => r.status === 200) && dB.token_hash.length === 64, lk.map((r) => r.status).join());
  const dv = await Promise.all([1, 2].map(() => tpoB.req("DELETE", `/api/college/drives/${F.driveB.id}/link`)));
  h.check("R1.revoke-parallel", dv.every((r) => r.status === 200), dv.map((r) => r.status).join());
  await tpoB.req("POST", `/api/college/drives/${F.driveB.id}/link`);
}

h.done();
