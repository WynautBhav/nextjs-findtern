/**
 * Terms pop-up, end to end: an intern who has not accepted the current terms
 * sees the dialog, ticks the box, continues, and never sees it again.
 *
 * Needs the situations seed (`npm run qa:seed`), which creates the one persona
 * left without acceptance (intern-terms, see lib/personas.mjs), and a running
 * app on E2E_BASE / the e2e port:
 *
 *   node --test e2e/terms-popup.e2e.mjs
 *
 * The test accepts the terms for that persona, so re-run the seed to reset it.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { chromium } from "playwright";

import { baseUrl } from "./lib/env.mjs";
import { loginState, persona } from "./lib/session.mjs";

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

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("main").first().waitFor({ timeout: 30_000 });
  assert.equal(await page.getByRole("dialog", { name: /updated terms/i }).count(), 0);
});
