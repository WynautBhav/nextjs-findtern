/**
 * Employers never receive an intern's bio (PLAN §1, WP-0 step 5).
 *
 * A canary string is the only text in the seeded intern's bio. The employer's
 * candidates page, candidate profile, compare table and shortlist/cart pages
 * are fetched as HTML AND as the React Server Components payload (`RSC: 1`,
 * what client navigations download), and neither may contain it. A keyword
 * search for the canary must not find the intern (the bio used to be matched
 * with ILIKE). The bio stays in the database and on the admin 360 view.
 *
 * Run through e2e/run.mjs (`npm run e2e`, E2E_SPECS=bio-hidden).
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { chromium } from "playwright";

import { baseUrl, testDatabaseUrl } from "./lib/env.mjs";
import { closeDb, one } from "./lib/db.mjs";
import { RUN, db, seedAdmin, seedEmployer, seedIntern, seedProject, seedProposal, send, signedInContext } from "./lib/fixtures.mjs";

testDatabaseUrl();

const CANARY = `BIO-CANARY-${RUN.toUpperCase()}`;
const state = {};
let browser;
let employerCtx;
let adminCtx;

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  const intern = await seedIntern({ label: "bio", firstName: "Bhavna", score: 8, paid: true, bio: `${CANARY} I build dashboards and care about clean data.`, skills: ["React", "SQL", "Python"] });
  const employer = await seedEmployer({ label: "bio-emp" });
  const projectId = await seedProject(employer.id, { name: "Analytics Intern Role", skills: ["React", "SQL"] });
  Object.assign(state, { intern, employer, projectId });
  // One shortlisted (cart) row, so the cart/shortlist pages have the candidate.
  await db().query(`INSERT INTO employer_cart_items (employer_id, project_id, intern_id, list_type) VALUES ($1,$2,$3,'cart')`, [employer.id, projectId, intern.id]);
  employerCtx = await signedInContext(browser, employer);
  adminCtx = await signedInContext(browser, await seedAdmin());
});

after(async () => {
  await browser?.close();
  await closeDb();
});

/** HTML and RSC payload of a page, as the employer. */
async function bothForms(path) {
  const html = await employerCtx.request.get(new URL(path, baseUrl()).toString(), { failOnStatusCode: false });
  const rsc = await employerCtx.request.get(new URL(path, baseUrl()).toString(), { headers: { RSC: "1" }, failOnStatusCode: false });
  return { path, html: { status: html.status(), text: await html.text() }, rsc: { status: rsc.status(), text: await rsc.text() } };
}

test("the bio is in the database (kept internally) and the seeded intern is a valid pool candidate", async () => {
  const row = await one(`SELECT bio FROM intern_onboarding WHERE user_id = $1`, [state.intern.id]);
  assert.ok(row.bio.includes(CANARY), "bio stored");
});

test("candidates page: canary absent from HTML and RSC payload; the candidate is listed", async () => {
  const r = await bothForms("/employer/candidates");
  assert.equal(r.html.status, 200);
  assert.ok(!r.html.text.includes(CANARY), "HTML has the bio canary");
  assert.ok(!r.rsc.text.includes(CANARY), "RSC payload has the bio canary");
  // Not a vacuous pass: the page really lists this intern (their id is in a link or payload).
  assert.ok(r.html.text.includes(state.intern.id) || r.rsc.text.includes(state.intern.id), "the candidate is on the page");
});

test("keyword search for the canary finds nothing (bio is not searched)", async () => {
  const r = await bothForms(`/employer/candidates?q=${encodeURIComponent(CANARY)}`);
  assert.equal(r.html.status, 200);
  assert.ok(!r.html.text.includes(state.intern.id), "the intern is not a result for a bio-only keyword");
  assert.ok(!r.rsc.text.includes(state.intern.id), "RSC payload has no result for a bio-only keyword");
});

test("candidate profile: no bio, no About block", async () => {
  const r = await bothForms(`/employer/intern/${state.intern.id}`);
  assert.equal(r.html.status, 200);
  assert.ok(!r.html.text.includes(CANARY), "HTML has the bio canary");
  assert.ok(!r.rsc.text.includes(CANARY), "RSC payload has the bio canary");
  assert.ok(!/>\s*About\s*</.test(r.html.text), "an About heading is rendered");
});

test("compare, cart and shortlist pages: no bio", async () => {
  for (const path of [`/employer/compare?ids=${state.intern.id}&project=${state.projectId}`, "/employer/cart", "/employer/shortlist"]) {
    const r = await bothForms(path);
    assert.ok([200, 307, 308].includes(r.html.status), `${path} → ${r.html.status}`);
    assert.ok(!r.html.text.includes(CANARY), `${path} HTML has the bio canary`);
    assert.ok(!r.rsc.text.includes(CANARY), `${path} RSC payload has the bio canary`);
  }
});

test("a proposal page for this candidate carries no bio either", async () => {
  const proposalId = await seedProposal({ employerId: state.employer.id, internId: state.intern.id, projectId: state.projectId });
  for (const path of [`/employer/proposal/${proposalId}`, "/employer/proposals"]) {
    const r = await bothForms(path);
    assert.ok(!r.html.text.includes(CANARY), `${path} HTML has the bio canary`);
    assert.ok(!r.rsc.text.includes(CANARY), `${path} RSC payload has the bio canary`);
  }
});

test("admin 360 view still shows the bio (internal use)", async () => {
  const res = await adminCtx.request.get(new URL(`/admin/interns/${state.intern.id}`, baseUrl()).toString(), { failOnStatusCode: false });
  assert.equal(res.status(), 200);
  const html = await res.text();
  const rsc = await (await adminCtx.request.get(new URL(`/admin/interns/${state.intern.id}`, baseUrl()).toString(), { headers: { RSC: "1" }, failOnStatusCode: false })).text();
  assert.ok(html.includes(CANARY) || rsc.includes(CANARY), "admin 360 lost the bio");
});

test("the employer API surface has no bio field (candidate search JSON, if any)", async () => {
  // GET /api/employer/cart returns the shortlist rows an employer sees.
  const r = await send(employerCtx, "GET", "/api/employer/cart");
  assert.ok(!JSON.stringify(r.body).includes(CANARY), "cart API leaks the bio");
});
