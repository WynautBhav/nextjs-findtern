#!/usr/bin/env node
/**
 * QA-002 retest: React #418 under prefers-reduced-motion on the five pages that
 * render CountUp / Thread. Needs a production build served by `npm run qa:serve`.
 * Each page × width loads RUNS times with reducedMotion "reduce"; any console or page
 * error fails. It also fetches the server HTML (no JS) and requires the page's
 * figures to be present, not a 0 placeholder.
 *
 * Usage: DATABASE_URL=<local clone> E2E_PORT=3501 node e2e/retest-qa002.mjs
 */
import { chromium } from "playwright";

import { baseUrl } from "./lib/env.mjs";
import { DASHBOARDS, cookieHeader, loginState, persona } from "./lib/session.mjs";

const RUNS = Number(process.env.RUNS || 6);
const WIDTHS = [390, 1440];
const PAGES = [...DASHBOARDS, { key: "intern-hired", path: "/intern/record" }, { key: "intern-hired", path: "/intern/earnings" }];

const browser = await chromium.launch();
const states = {};
let failed = 0;
for (const d of PAGES) {
  states[d.key] ??= await loginState(browser, persona(d.key));
  const state = states[d.key];
  const ssr = await fetch(new URL(d.path, baseUrl()), { headers: { cookie: cookieHeader(state) } });
  const html = await ssr.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
  const figures = (text.match(/[₹$]\s?[\d,]{3,}|\b\d+\.\d\b/g) ?? []).slice(0, 4);
  const zeroOnly = figures.length === 0;
  console.log(`[ssr] ${d.path}: HTTP ${ssr.status}, ${figures.length ? "figures " + figures.join(" | ") : "NO figures found"}`);
  for (const width of WIDTHS) {
    let errs = 0;
    for (let i = 0; i < RUNS; i++) {
      const ctx = await browser.newContext({ storageState: state, reducedMotion: "reduce", viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => m.type() === "error" && !/^Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 120)));
      page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
      await page.goto(new URL(d.path, baseUrl()).toString(), { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
      if (errors.length) { errs++; if (errs === 1) console.log("   first error:", errors[0]); }
      await ctx.close();
    }
    if (errs || zeroOnly) failed++;
    console.log(`[run] ${d.path} @${width}: ${errs}/${RUNS} loads with errors${zeroOnly ? " (no SSR figures)" : ""}`);
  }
}
await browser.close();
console.log(failed ? `FAIL: ${failed} page×width combos` : "PASS: 0 errors, figures in server HTML");
process.exit(failed ? 1 : 0);
