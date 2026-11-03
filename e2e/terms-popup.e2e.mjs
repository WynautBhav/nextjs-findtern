/**
 * Terms pop-up, end to end: an intern who has not accepted the current terms
 * sees the dialog, ticks the box, continues, and never sees it again.
 *
 * Needs the situations seed (`npm run qa:seed`), which creates the one persona
 * left without acceptance (intern-terms, see lib/personas.mjs), and a running
 * app (E2E_BASE_URL):
 *
 *   E2E_BASE_URL=http://localhost:3500 node --test e2e/terms-popup.e2e.mjs
 *
 * The test accepts the terms for that persona, so re-run the seed to reset it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import { chromium } from "playwright";

import { closeDb, one } from "./lib/db.mjs";
import { baseUrl } from "./lib/env.mjs";
import { loginState, persona } from "./lib/session.mjs";

// .mjs cannot import the TypeScript module (no loader here), so read the constant from its
// source: the test then follows src/lib/terms.ts instead of a second hard-coded date.
const CURRENT_TERMS_VERSION = /export const CURRENT_TERMS_VERSION\s*=\s*"([^"]+)"/.exec(
  readFileSync(new URL("../src/lib/terms.ts", import.meta.url), "utf8"),
)?.[1];
assert.ok(CURRENT_TERMS_VERSION, "could not read CURRENT_TERMS_VERSION from src/lib/terms.ts");

let browser;
let context;
let page;

before(async () => {
  browser = await chromium.launch();
  context = await browser.newContext({ storageState: await loginState(browser, persona("intern-terms")) });
  page = await context.newPage();
});

after(async () => {
  await browser?.close();
  await closeDb();
});

test("an intern who has not accepted sees the dialog and Continue is disabled", async () => {
  await page.goto(new URL("/intern/dashboard", baseUrl()).toString(), { waitUntil: "domcontentloaded" });
  const dialog = page.getByRole("dialog", { name: /updated terms/i });
  await dialog.waitFor({ timeout: 30_000 });
  assert.equal(await dialog.getByRole("button", { name: "Continue" }).isDisabled(), true);
  assert.equal(await dialog.getByRole("button", { name: "Sign out" }).isVisible(), true);
});

test("ticking the box and continuing closes it, and it stays gone after a reload", async () => {
  const dialog = page.getByRole("dialog", { name: /updated terms/i });
  await dialog.getByRole("checkbox", { name: /I have read and accept/i }).check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.waitFor({ state: "detached", timeout: 30_000 });

  const row = await one("select terms_accepted_version from users where email = $1", ["qa.intern.terms@qa.test"]);
  assert.equal(row?.terms_accepted_version, CURRENT_TERMS_VERSION);

  await page.reload({ waitUntil: "load" });
  await page.getByRole("main").first().waitFor({ timeout: 30_000 });
  // Let hydration finish: the dialog is client-rendered, so counting too early would pass vacuously.
  await page.waitForTimeout(1000);
  assert.equal(await page.getByRole("dialog", { name: /updated terms/i }).count(), 0);
});
