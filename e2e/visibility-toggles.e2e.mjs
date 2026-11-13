/**
 * Visibility switches never show a state the server has not stored (WP10b): "Open to work" and "Show when I'm
 * active to employers", on the intern's profile and settings pages.
 *
 *   QA_PORT=3124 DATABASE_URL=<local db> node e2e/qa-serve.mjs        # terminal 1 (a production build)
 *   E2E_BASE_URL=http://localhost:3124 DATABASE_URL=<local db> node --test --test-concurrency=1 e2e/visibility-toggles.e2e.mjs
 *
 * Per switch, per direction (on to off, off to on) and per browser (Chromium and Firefox; E2E_BROWSERS=chromium
 * to narrow):
 *   1. SLOW: the save is held 1500 ms. Within 150 ms of the click the switch is aria-busy / aria-disabled and a
 *      spinner shows (pending feedback), while aria-checked is STILL the old state until the response lands; then it
 *      is the new state, never blinking in between. A double click sends one request. The stored value changed.
 *   2. REJECTED (HTTP 500): aria-checked never leaves the true state, the error shows, busy clears, nothing stored.
 *   3. OFFLINE (request aborted): same.
 * Also: pending-state screenshots at 1440 and 390 when VISIBILITY_SHOTS=<dir> is set.
 *
 * Needs a local DB only (e2e/lib/env.mjs refuses anything that is not loopback).
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { after, before, describe, test } from "node:test";

import { chromium, firefox } from "playwright";

import { baseUrl, testDatabaseUrl } from "./lib/env.mjs";
import { closeDb, one } from "./lib/db.mjs";
import { seedIntern, signedInContext, db } from "./lib/fixtures.mjs";

testDatabaseUrl();

const HOLD_MS = 1500;
const PENDING_BUDGET_MS = 150;
const SHOTS = process.env.VISIBILITY_SHOTS;
const browsers = (process.env.E2E_BROWSERS ?? "chromium,firefox").split(",").map((s) => s.trim());
const TYPES = { chromium, firefox };

const S = {};

const CONTROLS = [
  {
    label: "open to work (profile)",
    key: "otw",
    path: "/intern/profile",
    api: "**/api/intern/onboarding",
    sw: (page) => page.getByRole("switch", { name: "Open to work" }).first(),
    errorRe: /Could not save\. Try again\./,
    reject: { error: "Could not save." },
    read: async () => (await one(`SELECT (extra_data->>'openToWork') IS DISTINCT FROM 'false' AS v FROM intern_onboarding WHERE user_id = $1`, [S.I.id])).v,
    write: (on) => db().query(`UPDATE intern_onboarding SET extra_data = jsonb_set(extra_data, '{openToWork}', $2::jsonb) WHERE user_id = $1`, [S.I.id, JSON.stringify(on)]),
  },
  {
    label: "activity visibility (settings)",
    key: "act",
    path: "/intern/settings",
    api: "**/api/intern/presence-visibility",
    sw: (page) => page.getByRole("switch", { name: /Show when I.m active to employers/ }).first(),
    errorRe: /Visibility is unavailable right now\.|Could not save\. Try again\./, // the server message (500) or the generic one (aborted)
    reject: { error: "Visibility is unavailable right now." },
    read: async () => (await one(`SELECT COALESCE((SELECT show_activity FROM user_presence WHERE user_id = $1), true) AS v`, [S.I.id])).v,
    write: (on) => db().query(`INSERT INTO user_presence (user_id, show_activity) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET show_activity = $2`, [S.I.id, on]),
  },
];

before(async () => {
  S.I = await seedIntern({ label: "vt", firstName: "Vera", score: 8, paid: true });
});

after(async () => {
  await db().query(`DELETE FROM user_presence WHERE user_id = $1`, [S.I.id]).catch(() => {});
  await closeDb();
});

/** Wires a page-side recorder on the switch: click time, first pending time, and every aria-checked value. */
const watch = (sw) =>
  sw.evaluate((el) => {
    window.__w = { clickAt: null, busyAt: null, spinnerAt: null, checked: [] };
    el.addEventListener("click", () => (window.__w.clickAt ??= performance.now()), { capture: true });
    const note = () => {
      if (window.__w.clickAt == null) return;
      if (el.getAttribute("aria-busy") === "true") window.__w.busyAt ??= performance.now();
      if (el.parentElement?.querySelector("svg.animate-spin")) window.__w.spinnerAt ??= performance.now();
    };
    new MutationObserver(note).observe(el.parentElement.parentElement, { attributes: true, childList: true, subtree: true });
    new MutationObserver(() => window.__w.checked.push(el.getAttribute("aria-checked"))).observe(el, { attributes: true, attributeFilter: ["aria-checked"] });
  });

for (const name of browsers) {
  describe(`${name}`, () => {
    let browser;
    let ctx;
    before(async () => {
      browser = await TYPES[name].launch({ headless: process.env.E2E_HEADED !== "1" });
      ctx = await signedInContext(browser, S.I);
    });
    after(async () => {
      await ctx?.close();
      await browser?.close();
    });

    for (const c of CONTROLS) {
      for (const start of [true, false]) {
        const dir = start ? "turn OFF" : "turn ON";
        describe(`${c.label}: ${dir}`, () => {
          let page;
          before(async () => {
            page = await ctx.newPage();
          });
          after(() => page.close());

          async function open(handler, viewport) {
            await c.write(start);
            await page.unroute(c.api).catch(() => {});
            if (handler) await page.route(c.api, handler);
            if (viewport) await page.setViewportSize(viewport);
            const res = await page.goto(new URL(c.path, baseUrl()).toString(), { waitUntil: "domcontentloaded" });
            assert.equal(res.status(), 200);
            const sw = c.sw(page);
            await sw.waitFor();
            await page.waitForFunction(() => document.readyState === "complete");
            await page.waitForTimeout(500); // hydrated: the click handler is attached once React has run
            assert.equal(await sw.getAttribute("aria-checked"), String(start), "starts in the true state");
            return sw;
          }

          test(`slow server: pending within ${PENDING_BUDGET_MS} ms, old state until the response, then the new state, one request`, async () => {
            let posts = 0;
            let responded = false;
            const sw = await open(async (route) => {
              if (route.request().method() !== "POST") return route.continue();
              posts++;
              await new Promise((r) => setTimeout(r, HOLD_MS));
              responded = true;
              await route.continue();
            });
            await watch(sw);
            await sw.dblclick(); // a second press while pending must not send a second request
            await page.waitForTimeout(PENDING_BUDGET_MS + 100);
            assert.equal(responded, false, "the response is still being held");
            // (a) pending feedback within the budget
            const p = await sw.evaluate(() => ({ busyMs: window.__w.busyAt == null ? null : window.__w.busyAt - window.__w.clickAt, spinnerMs: window.__w.spinnerAt == null ? null : window.__w.spinnerAt - window.__w.clickAt }));
            assert.ok(p.busyMs != null && p.busyMs <= PENDING_BUDGET_MS, `aria-busy after ${p.busyMs} ms (budget ${PENDING_BUDGET_MS})`);
            assert.ok(p.spinnerMs != null && p.spinnerMs <= PENDING_BUDGET_MS, `spinner after ${p.spinnerMs} ms (budget ${PENDING_BUDGET_MS})`);
            assert.equal(await sw.getAttribute("aria-disabled"), "true", "marked disabled while saving");
            // (b) the stored state is still shown
            assert.equal(await sw.getAttribute("aria-checked"), String(start), "still the true (old) state before the response");
            assert.equal(await sw.getAttribute("data-state"), start ? "checked" : "unchecked");
            // (c) the new state after
            await page.waitForFunction(() => document.querySelector('[role="switch"][aria-busy]') === null, null, { timeout: 5000 });
            await sw.evaluate((el, want) => new Promise((r) => { const t = setInterval(() => el.getAttribute("aria-checked") === want && (clearInterval(t), r()), 20); }), String(!start));
            const w = await sw.evaluate(() => window.__w.checked);
            assert.deepEqual(w, [String(!start)], "moved once, straight to the new state");
            assert.equal(posts, 1, "one request for a double click");
            assert.equal(await c.read(), !start, "the server really stored it");
            assert.equal(await sw.getAttribute("aria-busy"), null);
          });

          for (const [kind, handler] of [
            ["rejected (500)", async (route) => { if (route.request().method() !== "POST") return route.continue(); await new Promise((r) => setTimeout(r, 600)); await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify(c.reject) }); }],
            ["offline (aborted)", async (route) => { if (route.request().method() !== "POST") return route.continue(); await new Promise((r) => setTimeout(r, 600)); await route.abort("failed"); }],
          ]) {
            test(`${kind}: stays in the true state, shows the error`, async () => {
              const sw = await open(handler);
              await watch(sw);
              await sw.click();
              await page.waitForTimeout(PENDING_BUDGET_MS + 50);
              assert.equal(await sw.getAttribute("aria-busy"), "true", "pending while the request is out");
              assert.equal(await sw.getAttribute("aria-checked"), String(start), "true state while pending");
              const alert = page.getByRole("alert").filter({ hasText: c.errorRe });
              await alert.first().waitFor({ timeout: 5000 });
              await page.waitForFunction(() => document.querySelector('[role="switch"][aria-busy]') === null, null, { timeout: 5000 });
              assert.equal(await sw.getAttribute("aria-checked"), String(start), "still the true state after the failure");
              const w = await sw.evaluate(() => window.__w.checked);
              assert.deepEqual(w, [], "aria-checked never changed");
              assert.equal(await c.read(), start, "nothing was stored");
              assert.ok(!/Failed to fetch/i.test(await alert.first().innerText()));
              // and it is usable again
              assert.notEqual(await sw.getAttribute("aria-disabled"), "true");
            });
          }

          if (SHOTS && start) {
            test("screenshots of the pending state at 1440 and 390", async () => {
              mkdirSync(SHOTS, { recursive: true });
              for (const [vp, size] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]]) {
                let release;
                const gate = new Promise((r) => (release = r));
                const sw = await open(async (route) => { if (route.request().method() !== "POST") return route.continue(); await gate; await route.continue(); }, size);
                await sw.scrollIntoViewIfNeeded();
                await sw.click();
                await page.waitForTimeout(250);
                assert.equal(await sw.getAttribute("aria-busy"), "true");
                await page.screenshot({ path: `${SHOTS}/${c.key}-${name}-${vp}-pending.png` });
                release();
                await page.waitForFunction(() => document.querySelector('[role="switch"][aria-busy]') === null, null, { timeout: 5000 });
              }
            });
          }
        });
      }
    }
  });
}
