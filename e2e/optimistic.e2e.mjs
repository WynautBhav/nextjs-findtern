/**
 * Instant-feeling saves (WP10): the employer shortlist heart/button flips the moment it is pressed and rolls
 * back, with the error showing, when the server says no.
 *
 *   QA_PORT=3110 DATABASE_URL=<local db> node e2e/qa-serve.mjs        # terminal 1 (a production build)
 *   E2E_BASE_URL=http://localhost:3110 DATABASE_URL=<local db> node --test --test-concurrency=1 e2e/optimistic.e2e.mjs
 *
 * Per control and per browser (Chromium and Firefox; E2E_BROWSERS=chromium to narrow):
 *   1. SLOW: the cart request is held 1500 ms. The control's aria-pressed and look flip within 150 ms of the
 *      click, BEFORE any response, never blink back while the response lands, and only one request is sent
 *      for a double click. The row is really written afterwards.
 *   2. REJECTED (HTTP 500 with a message): it flips at once, then returns to the true state and the server's
 *      message shows as an alert. Nothing was written.
 *   3. OFFLINE (request aborted): same, with the connection message, never "Failed to fetch".
 * The same three run for removing a shortlist.
 *
 * Needs a local DB only (e2e/lib/env.mjs refuses anything that is not loopback).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { chromium, firefox } from "playwright";

import { baseUrl, testDatabaseUrl } from "./lib/env.mjs";
import { closeDb, one } from "./lib/db.mjs";
import { RUN, seedEmployer, seedIntern, seedProject, signedInContext, db } from "./lib/fixtures.mjs";

testDatabaseUrl();

const HOLD_MS = 1500;
const FLIP_BUDGET_MS = 150;
const SKILL = `Op${RUN}`;
const browsers = (process.env.E2E_BROWSERS ?? "chromium,firefox").split(",").map((s) => s.trim());
const TYPES = { chromium, firefox };

const S = {};
const inCart = async (internId) =>
  Number((await one(`SELECT count(*)::int AS n FROM employer_cart_items WHERE employer_id = $1 AND project_id = $2 AND intern_id = $3 AND list_type = 'cart'`, [S.E.id, S.project, internId])).n);
const setCart = async (internId, on) => {
  await db().query(`DELETE FROM employer_cart_items WHERE employer_id = $1 AND project_id = $2 AND intern_id = $3`, [S.E.id, S.project, internId]);
  if (on) await db().query(`INSERT INTO employer_cart_items (employer_id, project_id, intern_id, list_type) VALUES ($1,$2,$3,'cart')`, [S.E.id, S.project, internId]);
};

before(async () => {
  S.E = await seedEmployer({ label: "op-e" });
  S.project = await seedProject(S.E.id, { name: `Optimistic ${RUN}`, skills: [SKILL] });
  S.interns = [];
  for (let i = 0; i < 4; i++) S.interns.push(await seedIntern({ label: `op${i}`, firstName: "Olive", score: 8, paid: true, skills: [SKILL] }));
});

after(async () => {
  await db().query(`DELETE FROM employer_cart_items WHERE employer_id = $1`, [S.E.id]).catch(() => {});
  await closeDb();
});

for (const name of browsers) {
  describe(`${name}`, () => {
    let browser;
    let ctx;
    before(async () => {
      browser = await TYPES[name].launch({ headless: process.env.E2E_HEADED !== "1" });
      ctx = await signedInContext(browser, S.E);
    });
    after(async () => {
      await ctx?.close();
      await browser?.close();
    });

    /** The two controls: the heart in a candidate card and the button on the candidate's profile. */
    const CONTROLS = [
      { label: "candidate-card heart", path: () => `/employer/candidates?project=${S.project}&skills=${encodeURIComponent(SKILL)}`, button: (page, id) => page.locator(`ul[aria-label="Candidates"] > li:has(a[href*="/employer/intern/${id}"]) button[aria-label^="Shortlist"]`).first(), who: (i) => i[0] },
      { label: "profile Shortlist button", path: (id) => `/employer/intern/${id}?project=${S.project}`, button: (page, _id) => page.getByRole("button", { name: /^Shortlist(ed)?$/ }).first(), who: (i) => i[1] },
    ];

    for (const c of CONTROLS) {
      for (const start of [false, true]) {
        const action = start ? "remove" : "add";
        describe(`${c.label}: ${action}`, () => {
          let page;
          let intern;
          before(async () => {
            page = await ctx.newPage();
            intern = c.who(S.interns);
          });
          after(() => page.close());

          async function open(handler) {
            await setCart(intern.id, start);
            await page.unroute("**/api/employer/cart").catch(() => {});
            if (handler) await page.route("**/api/employer/cart", handler);
            const res = await page.goto(new URL(c.path(intern.id), baseUrl()).toString(), { waitUntil: "domcontentloaded" });
            assert.equal(res.status(), 200);
            const button = c.button(page, intern.id);
            await button.waitFor();
            // Hydrated: the click handler is attached once React has run.
            await page.waitForFunction(() => document.readyState === "complete");
            await page.waitForTimeout(500);
            assert.equal(await button.getAttribute("aria-pressed"), String(start), "starts in the true state");
            return button;
          }

          test(`slow server: flips within ${FLIP_BUDGET_MS} ms, before the response, never blinks, one request`, async () => {
            let posts = 0;
            let responded = false;
            const button = await open(async (route) => {
              if (route.request().method() !== "POST") return route.continue();
              posts++;
              await new Promise((r) => setTimeout(r, HOLD_MS));
              responded = true;
              await route.continue();
            });
            await button.evaluate((el) => {
              window.__w = { clickAt: null, changes: [] };
              el.addEventListener("click", () => (window.__w.clickAt ??= performance.now()), { capture: true });
              new MutationObserver(() => window.__w.changes.push({ t: performance.now(), v: el.getAttribute("aria-pressed") })).observe(el, { attributes: true, attributeFilter: ["aria-pressed"] });
            });
            await button.dblclick(); // a second press while pending must not send a second request
            await page.waitForTimeout(FLIP_BUDGET_MS + 100);
            assert.equal(responded, false, "the response is still being held");
            assert.equal(await button.getAttribute("aria-pressed"), String(!start), "flipped before the response");
            await page.waitForTimeout(HOLD_MS + 900);
            const w = await button.evaluate(() => ({ flipMs: window.__w.changes[0].t - window.__w.clickAt, values: window.__w.changes.map((x) => x.v) }));
            assert.ok(w.flipMs <= FLIP_BUDGET_MS, `flipped after ${Math.round(w.flipMs)} ms (budget ${FLIP_BUDGET_MS})`);
            assert.deepEqual(w.values, [String(!start)], "never blinked back while the response landed");
            assert.equal(posts, 1, "one request for a double click");
            assert.equal(await inCart(intern.id), start ? 0 : 1, "the server really saved it");
            assert.equal(await button.getAttribute("aria-pressed"), String(!start));
          });

          for (const [kind, handler, message] of [
            ["rejected (500 + message)", async (route) => { if (route.request().method() !== "POST") return route.continue(); await new Promise((r) => setTimeout(r, 600)); await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Shortlist is unavailable right now." }) }); }, /Shortlist is unavailable right now\./],
            ["offline (aborted)", async (route) => { if (route.request().method() !== "POST") return route.continue(); await new Promise((r) => setTimeout(r, 600)); await route.abort("failed"); }, /Couldn't reach the server/],
          ]) {
            test(`${kind}: flips at once, rolls back to the true state, shows the error`, async () => {
              const button = await open(handler);
              await button.evaluate((el) => {
                window.__w = { clickAt: null, changes: [] };
                el.addEventListener("click", () => (window.__w.clickAt ??= performance.now()), { capture: true });
                new MutationObserver(() => window.__w.changes.push({ t: performance.now(), v: el.getAttribute("aria-pressed") })).observe(el, { attributes: true, attributeFilter: ["aria-pressed"] });
              });
              await button.click();
              await page.waitForTimeout(FLIP_BUDGET_MS + 50);
              assert.equal(await button.getAttribute("aria-pressed"), String(!start), "flipped before the failure came back");
              const alert = page.getByRole("alert").filter({ hasText: message });
              await alert.first().waitFor({ timeout: 5000 });
              await page.waitForFunction((v) => document.querySelector("[aria-pressed][aria-busy]") === null, null, { timeout: 5000 });
              assert.equal(await button.getAttribute("aria-pressed"), String(start), "rolled back to the true state");
              const w = await button.evaluate(() => ({ flipMs: window.__w.changes[0].t - window.__w.clickAt, values: window.__w.changes.map((x) => x.v) }));
              assert.ok(w.flipMs <= FLIP_BUDGET_MS, `flipped after ${Math.round(w.flipMs)} ms`);
              assert.deepEqual(w.values, [String(!start), String(start)], "flip, then back; no success state in between");
              assert.equal(await inCart(intern.id), start ? 1 : 0, "nothing was written");
              const text = (await alert.first().innerText()).trim();
              assert.ok(!/Failed to fetch/i.test(text), text);
            });
          }
        });
      }
    }
  });
}
