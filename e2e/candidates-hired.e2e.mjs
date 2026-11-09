/**
 * Candidates the employer has hired are not on the employer's Candidates list.
 *
 *   - Employer A hired one intern (status "hired") and another through a legacy row
 *     (hired_at set, older status). Neither is a row, neither is in "N candidates",
 *     "All N", the Shortlist count or the page count; the number shown equals the rows.
 *   - Employer B (no hire) still sees both.
 *   - A hired intern left on a shortlist, or in the compare picks, is not counted either.
 *   - Their profile still opens by direct link (full name, because they are hired), and
 *     the hiring-steps "Hired" link leads to Orders, where they are listed.
 *
 * Every intern carries one skill unique to this run and every request filters on it,
 * so interns other specs left in the database cannot change a count.
 *
 * Run through e2e/run.mjs (`npm run e2e`, E2E_SPECS=candidates-hired).
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { chromium } from "playwright";

import { baseUrl, testDatabaseUrl } from "./lib/env.mjs";
import { closeDb, one } from "./lib/db.mjs";
import { RUN, db, seedEmployer, seedIntern, seedProject, seedProposal, signedInContext } from "./lib/fixtures.mjs";

testDatabaseUrl();

const SKILL = `Hx${RUN}`;
const FILLER = 13; // not hired: 13 + 2 hired is 15, so a page of 12 has a second page only if the hired two are left out
const state = { fillers: [] };
let browser;
let ctxA;
let ctxB;

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  const seed = (label, extra = {}) => seedIntern({ label, firstName: label === "hired" ? "Harini" : "Fiona", score: 8, paid: true, skills: [SKILL], ...extra });
  state.A = await seedEmployer({ label: "hx-a" });
  state.B = await seedEmployer({ label: "hx-b" });
  state.projA = await seedProject(state.A.id, { name: "Hired exclusion A", skills: [SKILL] });
  state.projB = await seedProject(state.B.id, { name: "Hired exclusion B", skills: [SKILL] });
  state.hired = await seed("hired");
  state.legacy = await seed("legacy"); // a hire written before the status was normalised: hired_at set, status still "accepted"
  state.live = await seed("live"); // an offer out, not a hire: stays listed
  for (let i = 0; i < FILLER; i++) state.fillers.push(await seed(`fill${i}`));
  await seedProposal({ employerId: state.A.id, internId: state.hired.id, projectId: state.projA, status: "hired" });
  const legacyId = await seedProposal({ employerId: state.A.id, internId: state.legacy.id, projectId: state.projA, status: "accepted" });
  await db().query(`UPDATE proposals SET hired_at = now() WHERE id = $1`, [legacyId]);
  await seedProposal({ employerId: state.A.id, internId: state.live.id, projectId: state.projA, status: "sent" });
  // The hired intern also sits on A's shortlist for the project, as a row saved before the hire would.
  await db().query(`INSERT INTO employer_cart_items (employer_id, project_id, intern_id, list_type) VALUES ($1,$2,$3,'cart')`, [state.A.id, state.projA, state.hired.id]);
  await db().query(`INSERT INTO employer_cart_items (employer_id, project_id, intern_id, list_type) VALUES ($1,$2,$3,'cart')`, [state.A.id, state.projA, state.fillers[0].id]);
  ctxA = await signedInContext(browser, state.A);
  ctxB = await signedInContext(browser, state.B);
});

after(async () => {
  await browser?.close();
  await closeDb();
});

const listUrl = (project, extra = "") => `/employer/candidates?project=${project}&skills=${encodeURIComponent(SKILL)}${extra}`;
const total = (n) => new RegExp(`^${n} candidates?$`);

/** What the page shows: the heading count, the All tab, the Shortlist tab, and the profile ids in the rows. */
async function read(ctx, path) {
  const page = await ctx.newPage();
  try {
    const res = await page.goto(new URL(path, baseUrl()).toString(), { waitUntil: "domcontentloaded" });
    assert.equal(res.status(), 200, `${path} → ${res.status()}`);
    await page.locator('h2 [role="status"]').first().waitFor();
    const heading = (await page.locator('h2 [role="status"]').first().innerText()).trim();
    const hrefs = await page.locator('ul.divide-y a[href^="/employer/intern/"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    const ids = [...new Set(hrefs.map((h) => h.split("/")[3].split("?")[0]))];
    // count() answers at once when the element is absent; innerText() would wait out the 20s timeout.
    const text = async (locator) => ((await locator.count()) ? (await locator.first().innerText()).replace(/\s+/g, " ").trim() : "");
    const tab = (name) => text(page.locator('nav[aria-label="Show"] a').filter({ hasText: name }));
    return { heading, ids, all: await tab("All"), shortlist: await tab("Shortlist"), picked: await text(page.locator("#compare-bar")) };
  } finally {
    await page.close();
  }
}

test("employer A: hired interns are not rows, and the count equals the rows", async () => {
  const r = await read(ctxA, listUrl(state.projA, "&pageSize=48"));
  assert.ok(!r.ids.includes(state.hired.id), "hired intern is listed");
  assert.ok(!r.ids.includes(state.legacy.id), "legacy-hired intern is listed");
  assert.ok(r.ids.includes(state.live.id), "an intern with an offer out (not hired) is still listed");
  assert.equal(r.ids.length, FILLER + 1, "13 fillers + the one with an offer out");
  assert.match(r.heading, total(FILLER + 1));
  assert.match(r.all, new RegExp(`^All ${FILLER + 1}$`));
});

test("employer A: pagination and the count leave the hired out (13 of 15 on a page of 12)", async () => {
  const p1 = await read(ctxA, listUrl(state.projA, "&pageSize=12"));
  assert.match(p1.heading, total(FILLER + 1));
  assert.equal(p1.ids.length, 12);
  const p2 = await read(ctxA, listUrl(state.projA, "&pageSize=12&page=2"));
  assert.equal(p2.ids.length, 2, "page 2 holds the remaining two");
  const seen = new Set([...p1.ids, ...p2.ids]);
  assert.equal(seen.size, FILLER + 1);
  assert.ok(!seen.has(state.hired.id) && !seen.has(state.legacy.id));
  const third = await read(ctxA, listUrl(state.projA, "&pageSize=12&page=3")); // past the end clamps to the last page
  assert.equal(third.ids.length, 2);
});

test("employer A: sorted by score the hired intern is still not there", async () => {
  const r = await read(ctxA, listUrl(state.projA, "&pageSize=48&sort=score&dir=asc"));
  assert.ok(!r.ids.includes(state.hired.id) && !r.ids.includes(state.legacy.id));
  assert.match(r.heading, total(FILLER + 1));
});

test("employer A: the Shortlist view and its count leave the hired out", async () => {
  const r = await read(ctxA, listUrl(state.projA, "&saved=1"));
  assert.ok(!r.ids.includes(state.hired.id), "hired intern on the shortlist is listed");
  assert.deepEqual(r.ids, [state.fillers[0].id]);
  assert.match(r.heading, /^1 shortlisted$/);
  const all = await read(ctxA, listUrl(state.projA));
  assert.match(all.shortlist, /^Shortlist \(1\)$/, "the tab counts the one row, not the hired one too");
});

test("employer A: a hired intern in the compare picks is dropped from the tray", async () => {
  const r = await read(ctxA, listUrl(state.projA, `&ids=${state.hired.id},${state.fillers[1].id}`));
  assert.match(r.picked, /^1 selected/, `tray: ${r.picked}`);
  assert.ok(!r.picked.includes("Compare"), "one pick is not enough to open Compare");
  // the same picks with nobody hired still count both
  const two = await read(ctxA, listUrl(state.projA, `&ids=${state.fillers[2].id},${state.fillers[1].id}`));
  assert.match(two.picked, /^2 selected/);
});

test("employer B (no hire): the same interns are all listed", async () => {
  const r = await read(ctxB, listUrl(state.projB, "&pageSize=48"));
  assert.ok(r.ids.includes(state.hired.id) && r.ids.includes(state.legacy.id) && r.ids.includes(state.live.id));
  assert.equal(r.ids.length, FILLER + 3);
  assert.match(r.heading, total(FILLER + 3));
});

test("a hired intern is still reachable by direct link, with the name unlocked", async () => {
  for (const intern of [state.hired, state.legacy]) {
    const res = await ctxA.request.get(new URL(`/employer/intern/${intern.id}?project=${state.projA}`, baseUrl()).toString(), { failOnStatusCode: false });
    assert.equal(res.status(), 200);
    const html = await res.text();
    assert.ok(html.includes(intern.lastName), `${intern.firstName} ${intern.lastName}: full name on the profile`);
  }
});

test("the hiring-steps Hired link leads to Orders, which lists them", async () => {
  const page = await ctxA.newPage();
  try {
    await page.goto(new URL(listUrl(state.projA), baseUrl()).toString(), { waitUntil: "domcontentloaded" });
    const hired = page.locator('nav[aria-label="Hiring steps"] a').filter({ hasText: "Hired" });
    assert.equal(await hired.getAttribute("href"), "/employer/orders");
    assert.match((await hired.innerText()).replace(/\s+/g, " "), /^Hired\s*1$/);
    await hired.click();
    await page.waitForURL(/\/employer\/orders/);
    await page.getByText(state.hired.lastName).first().waitFor();
  } finally {
    await page.close();
  }
});

test("sanity: the hire is really in the database", async () => {
  const row = await one(`SELECT count(*)::int AS n FROM proposals WHERE employer_id = $1 AND (status = 'hired' OR hired_at IS NOT NULL)`, [state.A.id]);
  assert.equal(row.n, 2);
});
