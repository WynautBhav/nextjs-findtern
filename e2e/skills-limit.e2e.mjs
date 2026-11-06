/**
 * The seven-skill limit, end to end (PLAN §5, OA9).
 *
 *   - UI: seven skills fill the picker; the add box and Add button are
 *     disabled, and the live region says "7 of 7. Remove one to add another."
 *     Removing one re-enables them.
 *   - API: seven are accepted; eight are refused with a sentence (intern
 *     onboarding route and admin skills route); the admin route de-duplicates
 *     case-insensitively.
 *   - Data: migration 0021 cuts a legacy profile with more than seven skills
 *     to its first seven, backs the original up, and a second run changes
 *     nothing. Employers see at most seven skills for a candidate (+N).
 *
 * Run through e2e/run.mjs (`npm run e2e`, E2E_SPECS=skills-limit).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { chromium } from "playwright";

import { baseUrl, ROOT, testDatabaseUrl } from "./lib/env.mjs";
import { closeDb, db, one, RUN, seedAdmin, seedEmployer, seedIntern, seedProject, send, signedInContext } from "./lib/fixtures.mjs";
import { visit } from "./lib/browser.mjs";

testDatabaseUrl();

const skill = (i) => `E2ESk${RUN}_${String(i).padStart(2, "0")}`;
const names = (n) => Array.from({ length: n }, (_, i) => skill(i + 1));
const state = {};
let browser;

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  // A profile the owner can still edit: complete, submitted, not scored (so the skills are not locked).
  state.intern = await seedIntern({ label: "skills", firstName: "Sana", skills: names(7) });
  state.admin = await seedAdmin();
  state.internCtx = await signedInContext(browser, state.intern);
  state.adminCtx = await signedInContext(browser, state.admin);
});

after(async () => {
  await browser?.close();
  await closeDb();
});

const storedSkills = async (id) => (await one(`SELECT skills FROM intern_onboarding WHERE user_id = $1`, [id])).skills;

/** The onboarding page opened on the Skills step as the seeded intern. */
async function openSkillsStep() {
  const page = await state.internCtx.newPage();
  await visit(page, "/intern/onboarding");
  // The step rail (desktop) and the phone stepper both list the steps; the visible one is clicked.
  await page.getByRole("button", { name: /^(Step \d+:?\s*)?Skills\b/i }).filter({ visible: true }).first().click();
  await page.locator("#skills").waitFor();
  return page;
}

async function failShot(page, name) {
  await page.screenshot({ path: join(ROOT, "e2e", ".artifacts", `fail-skills-limit-${name}.png`), fullPage: true }).catch(() => {});
}

test("UI: with seven skills the add box and Add are disabled; removing one frees them", async () => {
  const page = await openSkillsStep();
  try {
    const box = page.locator("#skills");
    assert.equal(await box.isDisabled(), true, "the add box is disabled at 7 skills");
    assert.equal(await page.getByRole("button", { name: /^Add$/ }).isDisabled(), true, "Add is disabled at 7 skills");
    await page.locator('[aria-live="polite"]').filter({ hasText: /7 of 7/ }).first().waitFor();
    await page.getByRole("button", { name: `Remove ${skill(7)}` }).click();
    await page.waitForFunction(() => !document.querySelector("#skills")?.disabled);
    assert.equal(await box.isDisabled(), false);
    await page.locator('[aria-live="polite"]').filter({ hasText: /6 of 7/ }).first().waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, "no sideways scroll");
  } catch (err) {
    await failShot(page, "ui");
    throw err;
  } finally {
    await page.close();
  }
});

test("UI (WP-C): the live region reads '7 of 7. Remove one to add another.'", async () => {
  // The previous test's removal may have been auto-saved as a draft: put the seven back first.
  assert.equal((await send(state.internCtx, "POST", "/api/intern/onboarding", { skills: names(7) })).status, 200);
  const page = await openSkillsStep();
  try {
    const live = page.locator('[aria-live="polite"]').filter({ hasText: /7 of 7/ }).first();
    await live.waitFor();
    assert.match(await live.innerText(), /7 of 7\.?\s*Remove one to add another\.?/i);
  } catch (err) {
    await failShot(page, "live-line");
    throw err;
  } finally {
    await page.close();
  }
});

test("API: seven skills are saved, eight are refused with a sentence", async () => {
  const ok = await send(state.internCtx, "POST", "/api/intern/onboarding", { skills: names(7) });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await storedSkills(state.intern.id)).length, 7);

  const eight = await send(state.internCtx, "POST", "/api/intern/onboarding", { skills: names(8) });
  assert.equal(eight.status, 400, JSON.stringify(eight.body));
  assert.match(JSON.stringify(eight.body), /at most 7/i);
  assert.equal((await storedSkills(state.intern.id)).length, 7, "a refused save changes nothing");

  const ratings = await send(state.internCtx, "POST", "/api/intern/onboarding", { skillsWithRatings: names(8).map((name) => ({ name })) });
  assert.equal(ratings.status, 400, "the older skillsWithRatings shape is capped too");
});

test("API (admin): 8 skills refused; duplicates differing by case are stored once", async () => {
  const id = state.intern.id;
  const eight = await send(state.adminCtx, "PUT", `/api/admin/interns/${id}/skills`, { skills: names(8) });
  assert.equal(eight.status, 400, JSON.stringify(eight.body));

  const withDupes = await send(state.adminCtx, "PUT", `/api/admin/interns/${id}/skills`, { skills: ["React", "react", "REACT", "SQL", "Python", "Go"] });
  assert.equal(withDupes.status, 200, JSON.stringify(withDupes.body));
  const stored = (await storedSkills(id)).map((s) => (typeof s === "string" ? s : s.name));
  assert.equal(stored.length, 4, `stored ${JSON.stringify(stored)}: React/react/REACT count once`);
  assert.equal(new Set(stored.map((s) => s.toLowerCase())).size, 4);

  const seven = await send(state.adminCtx, "PUT", `/api/admin/interns/${id}/skills`, { skills: names(7) });
  assert.equal(seven.status, 200);
  assert.equal((await storedSkills(id)).length, 7);
  const audit = await one(`SELECT 1 AS ok FROM admin_audit_log WHERE action = 'intern.skills_update' AND target_id = $1 LIMIT 1`, [id]);
  assert.ok(audit, "the admin change is audited");
});

test("data: migration 0021 cuts a legacy 12-skill profile to its first 7, backs it up, and a second run changes nothing", async () => {
  const legacy = await seedIntern({ label: "legacy", firstName: "Lata", score: 8, paid: true, skills: names(12) });
  await db().query(
    `UPDATE intern_onboarding SET extra_data = jsonb_set(extra_data, '{skillsWithRatings}', $2::jsonb) WHERE user_id = $1`,
    [legacy.id, JSON.stringify(names(12).map((name) => ({ name, rating: 2 })))],
  );
  state.legacy = legacy;

  const sqlText = readFileSync(join(ROOT, "drizzle", "0021_skills_cut_seven.sql"), "utf8");
  const statements = sqlText.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  const runMigration = async () => {
    const client = await db().connect();
    try {
      await client.query("BEGIN");
      const counts = [];
      for (const s of statements) counts.push((await client.query(s)).rowCount ?? 0);
      await client.query("COMMIT");
      return counts;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  };

  await runMigration();
  const cut = (await storedSkills(legacy.id)).map((s) => (typeof s === "string" ? s : s.name));
  assert.deepEqual(cut, names(7), "the first seven, in order");
  const ratings = (await one(`SELECT extra_data->'skillsWithRatings' AS r FROM intern_onboarding WHERE user_id = $1`, [legacy.id])).r;
  assert.equal(ratings.length, 7, "skillsWithRatings is cut too");
  const backup = await one(`SELECT jsonb_array_length(skills) AS n FROM intern_skills_backup WHERE user_id = $1`, [legacy.id]);
  assert.equal(backup.n, 12, "the original 12 are kept in the backup table");

  const second = await runMigration();
  const backups = await one(`SELECT count(*)::int AS n FROM intern_skills_backup WHERE user_id = $1`, [legacy.id]);
  assert.equal(backups.n, 1, "no second backup row");
  assert.deepEqual(await storedSkills(legacy.id).then((s) => s.map((x) => (typeof x === "string" ? x : x.name))), names(7));
  // INSERT, UPDATE skills, UPDATE skillsWithRatings: none of them touches a row on the second run.
  assert.deepEqual(second.slice(-3), [0, 0, 0], `second run row counts ${JSON.stringify(second)}`);
});

/** A scored candidate with TEN stored skills and an employer who can see them (set up once, on first use). */
let display;
async function displayFixture() {
  if (display) return display;
  const employer = await seedEmployer({ label: "skills-emp" });
  const projectId = await seedProject(employer.id, { name: "Skills Display Role", skills: [skill(1), skill(2)] });
  const prefix = (s) => s.replace(/E2ESk/, "E2ETen");
  const many = await seedIntern({ label: "ten", firstName: "Tara", score: 8, paid: true, skills: names(10).map(prefix) });
  const ctx = await signedInContext(browser, employer);
  display = { ctx, many, projectId, seventh: prefix(skill(7)), eighth: prefix(skill(8)) };
  return display;
}

for (const where of ["profile", "compare", "candidates"]) {
  test(`employer ${where}: at most seven skills for a candidate, +3 for the rest`, async () => {
    const d = await displayFixture();
    const path = {
      profile: `/employer/intern/${d.many.id}`,
      compare: `/employer/compare?ids=${d.many.id}&project=${d.projectId}`,
      candidates: "/employer/candidates",
    }[where];
    const html = await (await d.ctx.request.get(new URL(path, baseUrl()).toString(), { failOnStatusCode: false })).text();
    assert.ok(html.includes(d.seventh), `${path} shows the 7th skill`);
    assert.ok(!html.includes(d.eighth), `${path} shows an 8th skill`);
    assert.match(html, /\+\s*(<!-- -->)?3\b/, `${path} says +3 for the rest`);
  });
}
