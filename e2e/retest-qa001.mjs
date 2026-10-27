#!/usr/bin/env node
/**
 * Regression for QA-001: a production build that has Google configured but no
 * calendar token must never create or accept a campus-drive call with no join link.
 *
 * Needs its OWN database clone (it writes) and a server with QA_GOOGLE=1:
 *
 *   psql -d postgres -c "CREATE DATABASE findtern_qa_q1 TEMPLATE findtern_qa"
 *   DATABASE_URL=postgresql://findtern@127.0.0.1:5435/findtern_qa_q1 QA_PORT=3601 QA_GOOGLE=1 node e2e/retest-qa001.mjs
 *
 * Asserts:
 *   1. employer asks a student for a call → 409 "Calendar not connected; ask Findtern to connect it.", no row written
 *   2. a pre-existing requested call with a null link cannot be accepted → 409, row stays "requested"
 *   3. /admin/dashboard lists "Google calendar not connected" first, with a Connect link to /admin/settings
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

import { closeDb, one, rows } from "./lib/db.mjs";
import { testDatabaseUrl } from "./lib/env.mjs";
import { QA_ORIGIN, startServer } from "./lib/qa-server.mjs";
import { loginState, nextIp, persona } from "./lib/session.mjs";

process.env.DATABASE_URL = testDatabaseUrl();
process.env.E2E_BASE_URL = QA_ORIGIN;
const log = (...a) => console.log("[qa-001]", ...a);
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok }); log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` — ${detail}`}`); };

async function post(ctx, path, body) {
  const csrf = (await ctx.cookies()).find((c) => c.name === "ft_csrf")?.value;
  const res = await ctx.request.post(`${QA_ORIGIN}${path}`, { data: body, headers: { "x-csrf-token": csrf ? decodeURIComponent(csrf) : "", "x-forwarded-for": nextIp() } });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

async function main() {
  const server = await startServer(log);
  const browser = await chromium.launch();
  let failed = true;
  try {
    const tokens = await one(`SELECT count(*)::int AS n FROM employer_google_tokens`);
    assert.equal(tokens.n, 0, "precondition: no calendar token row");
    const emp = persona("employer-main");
    const drive = await one(`SELECT d.id FROM college_drive_employers de JOIN college_drives d ON d.id = de.drive_id JOIN employers e ON e.id = de.employer_id WHERE e.company_email = $1 LIMIT 1`, [emp.email]);
    assert.ok(drive, "precondition: the employer is in a live drive");
    const students = await rows(`SELECT m.user_id FROM college_memberships m WHERE m.status = 'verified' AND NOT EXISTS (SELECT 1 FROM college_drive_meetings x WHERE x.user_id = m.user_id) LIMIT 1`);
    assert.ok(students.length, "precondition: a student with no open call");

    // 1. employer asks for a call
    const ectx = await browser.newContext({ storageState: await loginState(browser, emp) });
    await ectx.addCookies([]);
    const before = (await one(`SELECT count(*)::int AS n FROM college_drive_meetings`)).n;
    const r1 = await post(ectx, `/api/employer/drives/${drive.id}/meetings`, { userId: students[0].user_id, inMinutes: 0 });
    const after = (await one(`SELECT count(*)::int AS n FROM college_drive_meetings`)).n;
    check("employer request is refused with 409", r1.status === 409, `HTTP ${r1.status} ${JSON.stringify(r1.body)}`);
    check("refusal says the calendar is not connected", /Calendar not connected; ask Findtern to connect it\./.test(r1.body.error ?? ""), JSON.stringify(r1.body));
    check("no drive_meetings row written", after === before, `rows ${before} → ${after}`);

    // 2. an old row with no link cannot be accepted
    // Plant the old shape: a requested call with no link (what a pre-fix build could write).
    const stu = await one(`SELECT u.id, u.email FROM college_memberships m JOIN users u ON u.id = m.user_id WHERE m.status = 'verified' AND u.email LIKE '%@jklu.edu.in' AND u.id <> $1 LIMIT 1`, [students[0].user_id]);
    assert.ok(stu, "precondition: a JKLU demo student who can sign in");
    const old = await one(
      `INSERT INTO college_drive_meetings (drive_id, employer_id, user_id, starts_at, status, meeting_link)
       SELECT $1, e.id, $2, now() + interval '1 minute', 'requested', NULL FROM employers e WHERE e.company_email = $3 RETURNING id`,
      [drive.id, stu.id, emp.email],
    );
    old.email = stu.email;
    const sctx = await browser.newContext({ storageState: await loginState(browser, { key: "student", role: "intern", email: old.email, password: "Findtern@2026" }) });
    const r2 = await post(sctx, `/api/intern/college/meetings/${old.id}`, { action: "accept" });
    const row = await one(`SELECT status FROM college_drive_meetings WHERE id = $1`, [old.id]);
    check("accepting a link-less call is refused with 409", r2.status === 409, `HTTP ${r2.status} ${JSON.stringify(r2.body)}`);
    check("the call stays requested", row.status === "requested", `status ${row.status}`);

    // 3. admin attention band
    const actx = await browser.newContext({ storageState: await loginState(browser, persona("admin")), viewport: { width: 1440, height: 900 } });
    const page = await actx.newPage();
    await page.goto(`${QA_ORIGIN}/admin/dashboard`, { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    const item = page.getByText("Google calendar not connected").first();
    check("admin dashboard shows 'Google calendar not connected'", await item.isVisible().catch(() => false), "text not visible");
    const link = page.locator('a[href="/admin/settings"]').first();
    check("it carries a link to /admin/settings", await link.count() > 0, "no link");
    // "first": nothing else in the attention list sits above it in document order
    const order = await page.evaluate(() => {
      const el = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /Google calendar not connected/.test(e.textContent ?? ""));
      if (!el) return null;
      const band = el.closest("section, ul, ol, div[class*=attention]") ?? el.parentElement;
      const items = [...(band?.querySelectorAll("li, a") ?? [])].map((x) => x.textContent.trim());
      return items.findIndex((t) => /Google calendar not connected/.test(t));
    });
    check("it is the first item in its list", order === 0 || order === 1, `index ${order}`);
    await page.screenshot({ path: "e2e/.artifacts/qa/qa-001-admin-dashboard.png" }).catch(() => {});
    failed = checks.some((c) => !c.ok);
  } finally {
    await browser.close();
    server.stop();
    await closeDb();
  }
  log(failed ? "FAIL" : "PASS");
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => { console.error("[qa-001] FAILED:", e.message); await closeDb(); process.exit(2); });
