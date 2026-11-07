/**
 * Bio removal and the 7-skill limit end to end (Chromium, QA stack). WRITTEN, NOT YET RUN.
 *
 *   E2E_BASE_URL=http://localhost:3500 DATABASE_URL=postgresql://findtern@127.0.0.1:5435/findtern_qa \
 *     node --test --test-concurrency=1 e2e/profile-limits.e2e.mjs      (npm run test:e2e:limits)
 *
 * Preconditions: QA seed's admin persona (lib/personas.mjs "admin"), server with TRUST_PROXY=1.
 * Interns and the employer are created by SQL (lib/fixtures2.mjs) and removed after. Interns get a bare
 * intern_onboarding row, so the onboarding calls below are partial (draft) saves, not `final`.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { chromium } from "playwright";

import { api, url } from "./lib/browser.mjs";
import { closeDb, one } from "./lib/db.mjs";
import { RUN, SKILLS, cleanup, mkEmployer, mkIntern, mkProject, mkProposal, signedIn } from "./lib/fixtures2.mjs";
import { persona } from "./lib/session.mjs";

let browser;
const P = {};
let I, L, A9, E; // fresh intern, legacy 9-skill intern (self edit), legacy 9-skill intern (admin edit), employer
const BIO = `Marker biography sentence ${RUN} that must never be stored or shown.`;
const skillNames = async (uid) => (await one(`SELECT skills FROM intern_onboarding WHERE user_id = $1`, [uid])).skills.map((s) => s.name);
const save = (page, skills) => api(page, "POST", "/api/intern/onboarding", { skills });
const adminSkills = (uid, skills) => api(P.A.page, "PUT", `/api/admin/interns/${uid}/skills`, { skills });

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  E = await mkEmployer("limE");
  I = await mkIntern("limI", { skills: SKILLS.slice(0, 4) });
  L = await mkIntern("limL", { skills: SKILLS }); // legacy: 9 skills
  A9 = await mkIntern("limA", { skills: SKILLS }); // legacy: 9 skills
  P.I = await signedIn(browser, I);
  P.L = await signedIn(browser, L);
  P.E = await signedIn(browser, E);
  P.A = await signedIn(browser, persona("admin"));
});

after(async () => {
  for (const p of Object.values(P)) await p.ctx.close().catch(() => {});
  await browser?.close();
  await cleanup();
  await closeDb();
});

test("onboarding accepts a `bio` field but stores nothing", async () => {
  const r = await api(P.I.page, "POST", "/api/intern/onboarding", { bio: BIO, skills: SKILLS.slice(0, 4), city: "Pune" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = await one(`SELECT bio, city, extra_data::text AS extra, experience_json::text AS exp, preview_summary FROM intern_onboarding WHERE user_id = $1`, [I.id]);
  assert.equal(row.city, "Pune", "the rest of the save worked");
  assert.equal(row.bio, null, "bio column untouched");
  for (const [k, v] of Object.entries(row)) assert.ok(!String(v ?? "").includes(`Marker biography sentence ${RUN}`), `bio text leaked into ${k}`);
  const any = await one(`SELECT count(*)::int AS n FROM intern_onboarding WHERE bio LIKE $1`, [`%${RUN}%`]);
  assert.equal(any.n, 0);
});

test("employer candidate pages and responses never contain bio (even for a legacy row that has one)", async () => {
  // A legacy value written straight into SQL: no page or JSON may surface it.
  await one(`UPDATE intern_onboarding SET bio = $2 WHERE user_id = $1 RETURNING id`, [I.id, BIO]);
  const proj = await mkProject(E.id, `Bio check ${RUN}`);
  const prop = await mkProposal(E.id, I.id, proj);
  const paths = ["/employer/candidates", `/employer/intern/${I.id}`, "/employer/proposals", `/employer/proposal/${prop}`, "/employer/shortlist"];
  let rendered = 0;
  for (const p of paths) {
    // Raw response: includes the server-rendered HTML and the flight payload with every prop.
    const res = await P.E.ctx.request.get(url(p));
    if (res.status() !== 200) continue; // a path this build does not serve for this account is not a leak
    rendered++;
    const html = await res.text();
    assert.ok(!html.includes(`Marker biography sentence ${RUN}`), `${p} contains the bio text`);
    assert.ok(!/\\?"bio\\?"\s*:/.test(html), `${p} contains a "bio" key`);
  }
  assert.ok(rendered >= 1, "at least one candidate page rendered, otherwise this proves nothing");
  const cand = await P.E.ctx.request.get(url(`/employer/intern/${I.id}`));
  assert.equal(cand.status(), 200, "the proposal's intern profile renders for its employer");
});

test("onboarding: 8 skills → refused with a clear message, 7 accepted", async () => {
  const eight = await save(P.I.page, SKILLS.slice(0, 8));
  assert.ok([400, 422].includes(eight.status), `8 skills → ${eight.status}`); // handler answers 400
  assert.match(String(eight.body.error), /at most 7/i);
  assert.deepEqual(await skillNames(I.id), SKILLS.slice(0, 4), "nothing changed");
  const seven = await save(P.I.page, SKILLS.slice(0, 7));
  assert.equal(seven.status, 200, JSON.stringify(seven.body));
  assert.equal((await skillNames(I.id)).length, 7);
});

test("a legacy intern with 9 skills sees all 9", async () => {
  await P.L.page.goto(url("/intern/profile"), { waitUntil: "domcontentloaded" });
  const text = (await P.L.page.locator("main").textContent()) ?? "";
  const missing = SKILLS.filter((s) => !text.includes(s));
  assert.deepEqual(missing, [], "every one of the 9 skills is shown");
});

test("legacy 9 skills: unchanged save ok, swapped 9 refused, growing refused, reduce to 7 ok", async () => {
  const same = await save(P.L.page, SKILLS);
  assert.equal(same.status, 200, JSON.stringify(same.body));
  assert.equal((await skillNames(L.id)).length, 9, "still 9");

  const reordered = await save(P.L.page, [...SKILLS].reverse());
  assert.equal(reordered.status, 200, "same set in another order counts as unchanged");

  const swapped = [...SKILLS.slice(0, 8), "Java"];
  const sw = await save(P.L.page, swapped);
  assert.equal(sw.status, 400, JSON.stringify(sw.body));
  assert.match(String(sw.body.error), /reduce to 7/i);
  assert.ok((await skillNames(L.id)).includes("SQL") && !(await skillNames(L.id)).includes("Java"), "stored list unchanged");

  const grown = await save(P.L.page, [...SKILLS, "Java"]);
  assert.equal(grown.status, 400, "10 skills is refused");

  const reduced = await save(P.L.page, SKILLS.slice(0, 7));
  assert.equal(reduced.status, 200, JSON.stringify(reduced.body));
  assert.equal((await skillNames(L.id)).length, 7);
  const back = await save(P.L.page, SKILLS.slice(0, 8));
  assert.equal(back.status, 400, "once at 7 there is no way back above it");
});

test("admin intern skills route enforces the same limit", async () => {
  const base = await adminSkills(I.id, SKILLS.slice(0, 8));
  assert.equal(base.status, 400, `8 on a normal intern → ${base.status}`);
  assert.match(String(base.body.error), /at most 7/i);

  const same = await adminSkills(A9.id, SKILLS);
  assert.equal(same.status, 200, "legacy 9 saved unchanged");
  assert.equal((await skillNames(A9.id)).length, 9);

  const swapped = await adminSkills(A9.id, [...SKILLS.slice(0, 8), "Java"]);
  assert.equal(swapped.status, 400, JSON.stringify(swapped.body));
  assert.match(String(swapped.body.error), /reduce to 7/i);

  const seven = await adminSkills(A9.id, SKILLS.slice(0, 7));
  assert.equal(seven.status, 200, JSON.stringify(seven.body));
  assert.equal((await skillNames(A9.id)).length, 7);

  const eight = await adminSkills(A9.id, SKILLS.slice(0, 8));
  assert.equal(eight.status, 400, "no way back above 7");
  const audit = await one(`SELECT count(*)::int AS n FROM admin_audit_log WHERE target_id = $1 AND action = 'intern.skills_update'`, [A9.id]);
  assert.equal(audit.n, 2, "only the two accepted saves are audited");
});
