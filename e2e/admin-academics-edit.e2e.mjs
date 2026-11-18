/**
 * Admin edits an intern's education, end to end on a scratch database (Chromium + a real server + real Postgres).
 *
 *   E2E_BASE_URL=http://localhost:3203 DATABASE_URL=postgresql://findtern@127.0.0.1:54403/acad \
 *     SHOTS=/some/dir node --test e2e/admin-academics-edit.e2e.mjs
 *
 * The intern is shaped like the production one the owner could not edit: Ph.D, completed, free-promo payment row,
 * approved, hidden, four ratings, EMPTY score, no cgpaVerification. Checks, as an Operations admin (interns:write):
 *   - the ratings editor saves (the "grades" half of the report) and the audit row names the admin;
 *   - the Education editor saves level, degree, score type and score; the intern's OWN profile page then shows them;
 *   - certifications and professional courses are still there; an out-of-range score is refused in the form and by the API;
 *   - a read-only admin (interns:read) sees the details as text with the reason, and the API refuses their PUT (403).
 * Everything it creates is removed again.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright";
import pg from "pg";

import { cleanIntern, seedAdmin, seedProdLikeIntern } from "./lib/prod-like-intern.mjs";
import { testDatabaseUrl } from "./lib/env.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3203";
const SHOTS = process.env.SHOTS ?? "";
const PASSWORD = "Findtern@2026";
let pool;
let browser;
let intern;
let ipSeq = 100 + Math.floor(Math.random() * 100);
const ip = () => `10.77.${ipSeq >> 8}.${ipSeq++ & 255}`;
const academicsOf = async () => (await pool.query("select extra_data->'academics' a, extra_data->'cgpaVerification' v from intern_onboarding where user_id = $1", [intern.id])).rows[0];

async function session(kind, email, password, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const api = kind === "admin" ? "/api/auth/admin/login" : "/api/auth/login";
  const res = await ctx.request.post(`${BASE}${api}`, { data: { email, password }, headers: { "x-forwarded-for": ip(), "content-type": "application/json" } });
  assert.equal(res.status(), 200, `${kind} login ${email}`);
  return ctx;
}

before(async () => {
  pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  browser = await chromium.launch();
  intern = await seedProdLikeIntern(pool);
  await seedAdmin(pool, { email: "e2e-acad-ops@findtern.test", role: "exec_operations" });
  // A role that can open the candidate page but not edit it (the seeded roles all heal to include interns:write).
  await pool.query("insert into admin_roles (key, name, permissions) values ('e2e_acad_readonly', 'E2E read-only', $1::jsonb) on conflict (key) do update set permissions = $1::jsonb", [JSON.stringify(["interns:read"])]);
  await seedAdmin(pool, { email: "e2e-acad-ro@findtern.test", role: "e2e_acad_readonly" });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
});

after(async () => {
  if (intern) await cleanIntern(pool, intern.id);
  await pool.query("delete from admins where email like 'e2e-acad-%'");
  await pool.query("delete from admin_roles where key = 'e2e_acad_readonly'");
  await browser?.close();
  await pool.end();
});

test("Operations admin: ratings save, then education saves and the intern's own profile shows it", async () => {
  const ctx = await session("admin", "e2e-acad-ops@findtern.test", PASSWORD);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/interns/${intern.id}`, { waitUntil: "networkidle" });

  // The grades: four ratings.
  await page.locator("#rating-communication").fill("9");
  await page.getByRole("button", { name: /Save ratings and links/ }).click();
  await page.getByText(/Saved\. Employers filtering/).waitFor();
  const [{ r }] = (await pool.query("select extra_data->'ratings' r from intern_onboarding where user_id = $1", [intern.id])).rows;
  assert.equal(r.communication, 9);

  // Before.
  const before = await academicsOf();
  console.log("BEFORE:", JSON.stringify({ level: before.a.level, degree: before.a.degree, score: before.a.score, scoreType: before.a.scoreType, cgpaVerification: before.v }));
  assert.equal(before.a.score, "");

  await page.locator("#acad-level").scrollIntoViewIfNeeded();
  const card = page.locator("#acad-level").locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
  if (SHOTS) await card.screenshot({ path: join(SHOTS, "editor-1440x900-before.png") });

  // An impossible score is refused in the form, before any request.
  await page.locator("#acad-level").selectOption("Bachelor's");
  await page.locator("#acad-degree").fill("B.Tech");
  await page.locator("#acad-score-type").selectOption("cgpa");
  await page.locator("#acad-score").fill("11");
  await page.locator("#acad-score-err").waitFor();
  assert.match(await page.locator("#acad-score-err").innerText(), /out of 10/);
  // Save is off while a field is wrong, and no request goes out.
  let calls = 0;
  page.on("request", (q) => q.url().endsWith("/academics") && calls++);
  assert.equal(await page.getByRole("button", { name: "Save education" }).isDisabled(), true);
  await page.getByRole("button", { name: "Save education" }).click({ force: true }).catch(() => {});
  assert.equal(calls, 0, "no request for an invalid score");
  if (SHOTS) await card.screenshot({ path: join(SHOTS, "editor-1440x900-error.png") });

  // A valid one saves.
  await page.locator("#acad-score").fill("8.4");
  await page.getByRole("button", { name: "Save education" }).click();
  await page.getByText(/Saved\. The candidate and employers/).waitFor();
  const after = await academicsOf();
  console.log("AFTER:", JSON.stringify({ level: after.a.level, degree: after.a.degree, score: after.a.score, scoreType: after.a.scoreType, cgpaVerification: after.v }));
  assert.equal(after.a.score, "8.4");
  assert.equal(after.a.scoreType, "cgpa");
  assert.equal(after.a.level, "bachelors");
  assert.equal(after.a.certifications[0].name, "Keep this cert");
  assert.equal(after.a.professionalCourses[0].name, "CA");
  assert.equal(after.v, null, "no verification record is invented");
  const [extra] = (await pool.query("select extra_data e from intern_onboarding where user_id = $1", [intern.id])).rows;
  assert.equal(extra.e.certNote, "keep-me");
  assert.equal(extra.e.findternScore !== undefined, true);

  // The audit rows name the admin and carry before/after of the changed fields only.
  const audits = (await pool.query("select a.action, a.meta, ad.email from admin_audit_log a join admins ad on ad.id = a.admin_id where a.target_id = $1 order by a.created_at", [intern.id])).rows;
  const acad = audits.find((x) => x.action === "intern.academics_update");
  assert.ok(acad, "academics audit row");
  assert.equal(acad.email, "e2e-acad-ops@findtern.test");
  assert.deepEqual(Object.keys(acad.meta.changes).sort(), ["degree", "qualificationLevel", "score", "scoreType"]);
  assert.deepEqual(acad.meta.changes.score, { from: "", to: "8.4" });
  assert.ok(audits.some((x) => x.action === "intern.ratings_update"));
  if (SHOTS) await card.screenshot({ path: join(SHOTS, "editor-1440x900-saved.png") });

  // Read it back on the intern's own profile.
  const own = await session("intern", intern.email, PASSWORD);
  const ip1 = await own.newPage();
  await ip1.goto(`${BASE}/intern/profile`, { waitUntil: "domcontentloaded" });
  await ip1.waitForTimeout(4000);
  console.log("intern profile url:", ip1.url());
  const text = await ip1.locator("body").innerText();
  console.log("intern profile shows:", text.split("\n").filter((l) => /CGPA|B\.Tech/.test(l)));
  assert.match(text, /CGPA 8\.4/, "the intern's own profile shows the edited score");
  assert.match(text, /B\.Tech/);
  await own.close();

  // The API refuses the same impossible score for any caller.
  const bad = await ctx.request.put(`${BASE}/api/admin/interns/${intern.id}/academics`, {
    data: { score: "11" },
    headers: { "content-type": "application/json", "x-csrf-token": (await ctx.cookies()).find((c) => c.name.includes("csrf"))?.value ?? "" },
  });
  assert.equal(bad.status(), 400);
  await ctx.close();
});

test("an admin without interns:write sees text and the reason; the API refuses their write", async () => {
  const ctx = await session("admin", "e2e-acad-ro@findtern.test", PASSWORD);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/interns/${intern.id}`, { waitUntil: "networkidle" });
  assert.equal(await page.locator("#acad-score").count(), 0);
  await page.getByText("Needs the Edit candidates permission to change these details.").waitFor();
  const res = await ctx.request.put(`${BASE}/api/admin/interns/${intern.id}/academics`, {
    data: { score: "9" },
    headers: { "content-type": "application/json", "x-csrf-token": (await ctx.cookies()).find((c) => c.name.includes("csrf"))?.value ?? "" },
  });
  console.log("read-only admin PUT:", res.status());
  assert.ok([403].includes(res.status()), `status ${res.status()}`);
  const row = await academicsOf();
  assert.equal(row.a.score, "8.4", "unchanged");
  await ctx.close();
});

test("mobile 390x844: the editor fits without sideways scroll", async () => {
  const ctx = await session("admin", "e2e-acad-ops@findtern.test", PASSWORD, { width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/interns/${intern.id}`, { waitUntil: "networkidle" });
  await page.locator("#acad-level").scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
  const card = page.locator("#acad-level").locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "editor-390x844.png") });
  if (SHOTS) await card.screenshot({ path: join(SHOTS, "editor-390x844-card.png") });
  await ctx.close();
});
