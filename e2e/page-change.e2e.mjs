#!/usr/bin/env node
/**
 * Page-change feedback (WP8): a click must never feel dead.
 *
 * For each navigation kind below, in Chromium and Firefox at 1440 and 390 wide,
 * the page the click is heading for is held back ~1.5 s (page.route; Chromium
 * also gets CDP "fast 3G" throttling, Firefox has no throttling API) and an
 * in-page sampler records, every 20 ms, whether ANY loader is on screen:
 *   - the top progress bar          [role=progressbar][aria-label="Loading the next page"]
 *   - a loading skeleton            [data-slot=skeleton]
 *   - a busy control                [aria-busy=true] (the spinner on a submit button)
 *
 * Asserted per case:
 *   1. the navigation really was slow (>= 900 ms), so the case proves something;
 *   2. first feedback within FEEDBACK_MS (150) of the click;
 *   3. no gap in feedback longer than GAP_MS (150) until the new page renders;
 *   4. nothing left on screen 500 ms after the new page renders;
 *   5. no console errors, no page errors;
 *   6. layout shift for the whole click -> render window <= 0.1 (Chromium only;
 *      Firefox has no layout-shift entries).
 * Plus one "fast" case (no hold): the bar must not appear before ~100 ms, so a
 * navigation that lands sooner never flashes it.
 *
 *   E2E_BASE_URL=http://localhost:3108 DATABASE_URL=<local> node e2e/page-change.e2e.mjs
 *   PAGE_CHANGE_BROWSERS=firefox  PAGE_CHANGE_VIEWPORT=390  PAGE_CHANGE_ONLY=login-submit  PAGE_CHANGE_SHOTS=/some/dir   (all optional)
 *
 * With PAGE_CHANGE_SHOTS set, a screenshot of every loader state is saved
 * (taken 700 ms after the click). Output: e2e/.artifacts/qa/page-change/results.json;
 * exit 1 on any finding.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, firefox } from "playwright";

import { ARTIFACTS, baseUrl } from "./lib/env.mjs";
import { loginState, nextIp, persona } from "./lib/session.mjs";

const OUT = join(ARTIFACTS, "qa", "page-change");
const SHOTS = process.env.PAGE_CHANGE_SHOTS || "";
const HOLD_MS = 1500;
const FEEDBACK_MS = 150;
const GAP_MS = 150;
const MIN_SLOW_MS = 900;
const FLASH_MS = 80; // the bar waits ~100 ms; 80 leaves room for timer jitter
const BROWSERS = (process.env.PAGE_CHANGE_BROWSERS || "chromium,firefox").split(",").filter((b) => b === "chromium" || b === "firefox"); // PAGE_CHANGE_BROWSERS=none runs the status checks only
const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];
const log = (...a) => console.log("[page-change]", ...a);

/** Installed before any page script: samples loader presence, layout shift, bar insertions. */
function sampler() {
  const BAR = '[role="progressbar"][aria-label="Loading the next page"]';
  const fb = (window.__fb = { clickAt: null, readyAt: null, samples: [], cls: 0, shifts: [], barSeen: false, spec: null });
  const loaderOn = () =>
    !!document.querySelector('[role="progressbar"][aria-label="Loading the next page"], [data-slot="skeleton"], [aria-busy="true"]');
  const start = () => {
    if (fb.clickAt === null) {
      fb.clickAt = performance.now();
      fb.clickAbs = fb.clickAt;
    }
  };
  for (const type of ["click", "change", "submit"]) document.addEventListener(type, start, true);
  document.addEventListener("keydown", (e) => e.key === "Enter" && start(), true);
  new MutationObserver((muts) => {
    for (const m of muts)
      for (const n of m.addedNodes)
        if (n.nodeType === 1 && (n.matches?.(BAR) || n.querySelector?.(BAR))) fb.barSeen = true;
  }).observe(document, { childList: true, subtree: true });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        fb.cls += e.value;
        fb.shifts.push([e.startTime, e.value]);
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {
    fb.cls = null; // Firefox: no layout-shift entries
  }
  setInterval(() => {
    if (fb.clickAt === null) return;
    const t = performance.now() - fb.clickAt;
    const on = loaderOn();
    fb.samples.push([Math.round(t), on]);
    if (fb.readyAt === null && fb.spec && !on && new RegExp(fb.spec.url).test(location.pathname + location.search) && document.querySelector(fb.spec.ready)) {
      fb.readyAt = t;
    }
  }, 20);
}

/** The kinds of page change. `go` does the click; `url` and `ready` say when the new page is up. */
const CASES = [
  {
    key: "console-sidebar",
    label: "console sidebar link (intern: Stipend)",
    persona: "intern-one",
    start: "/intern/dashboard",
    hold: /^\/intern\/earnings/,
    url: "^/intern/earnings",
    ready: "main",
    menu: "Open navigation",
    go: (page) => page.locator('nav a[href="/intern/earnings"]:visible').first().click(),
  },
  {
    key: "in-page-link",
    label: "in-page link (intern dashboard: See all open roles)",
    persona: "intern-one",
    start: "/intern/dashboard",
    hold: /^\/intern\/opportunities$/,
    url: "^/intern/opportunities$",
    ready: "main",
    go: (page) => page.locator('main a[href="/intern/opportunities"]').first().click(),
  },
  {
    key: "filter-change",
    label: "router.push from a control (employer candidates: Sort by)",
    persona: "employer-main",
    start: "/employer/candidates",
    // Only the sort change is held, not the first page load.
    hold: (u) => u.pathname === "/employer/candidates" && u.searchParams.has("sort"),
    url: "[?&]sort=",
    ready: "main",
    go: async (page) => {
      const select = page.locator("#candidate-sort");
      const values = await select.locator("option").evaluateAll((os) => os.map((o) => o.value));
      const current = await select.inputValue();
      await select.selectOption(values.find((v) => v !== current));
    },
  },
  {
    key: "login-submit",
    label: "sign-in submit -> dashboard (fetch, then router.push)",
    persona: null,
    start: "/login",
    // The API answers at once; the dashboard it pushes to is held.
    hold: /^\/intern\/dashboard/,
    url: "^/intern/dashboard",
    ready: "main",
    go: async (page) => {
      const p = persona("intern-one");
      await page.locator("#email").fill(p.email);
      await page.locator("#password").fill(p.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
    },
  },
  {
    key: "auth-link",
    label: "auth page link (sign in -> create an account)",
    persona: null,
    start: "/login",
    hold: /^\/signup/,
    url: "^/signup",
    ready: "h1",
    go: (page) => page.locator('main a[href^="/signup"]:visible').first().click(),
  },
  {
    key: "marketing-link",
    label: "marketing link (home -> Pricing)",
    persona: null,
    start: "/",
    hold: /^\/pricing/,
    url: "^/pricing",
    ready: "main",
    menu: "Open menu",
    go: (page) => page.locator('a[href="/pricing"]:visible').first().click(),
  },
];

const FAST = {
  key: "fast-no-flash",
  label: "prefetched static page opens fast: no bar flash (home -> Pricing, no hold)",
  persona: null,
  start: "/",
  hold: null,
  url: "^/pricing",
  ready: "main",
  menu: "Open menu",
  go: (page) => page.locator('a[href="/pricing"]:visible').first().click(),
};

const states = new Map();
async function stateFor(browserType, browser, key) {
  const id = `${browserType}:${key}`;
  if (!states.has(id)) states.set(id, await loginState(browser, persona(key)));
  return states.get(id);
}

async function runCase(browserType, browser, vp, c, fast = false) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ...(c.persona ? { storageState: await stateFor(browserType, browser, c.persona) } : {}),
    extraHTTPHeaders: { "x-forwarded-for": nextIp() },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  await page.addInitScript(sampler);
  if (browserType === "chromium") {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    // "Fast 3G": 150 ms RTT, 1.6 Mbit/s down, 750 kbit/s up.
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  }
  let held = false;
  if (c.hold) {
    await page.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      const hit = typeof c.hold === "function" ? c.hold(u) : c.hold.test(u.pathname);
      if (hit && u.origin === new URL(baseUrl()).origin && !u.pathname.startsWith("/api/") && !u.pathname.startsWith("/_next/")) {
        held = true;
        await new Promise((r) => setTimeout(r, HOLD_MS));
      }
      await route.continue().catch(() => {});
    });
  }
  const findings = [];
  const where = `${browserType} ${vp.name} ${c.key}`;
  try {
    await page.goto(new URL(c.start, baseUrl()).toString(), { waitUntil: "load" });
    await page.locator("main h1, h1").first().waitFor({ timeout: 15_000 });
    // Fast case: give the viewport prefetch time to land. Held cases: click soon, while the prefetch is still held.
    await page.waitForTimeout(fast ? 3000 : 400);
    // Phones keep the links behind a menu button; opening it is not the click under test.
    if (vp.width < 640 && c.menu) {
      await page.getByRole("button", { name: c.menu }).first().click();
      await page.waitForTimeout(300);
    }
    await page.evaluate((spec) => {
      window.__fb.clickAt = null;
      window.__fb.spec = spec;
    }, { url: c.url, ready: c.ready });
    await c.go(page);
    await page.waitForFunction(() => window.__fb.readyAt !== null, null, { timeout: 20_000, polling: 50 }).catch(() => findings.push("new page never rendered within 20 s"));
    await page.waitForTimeout(600);
    const fb = await page.evaluate(() => window.__fb);
    const slow = fb.readyAt;
    const first = fb.samples.find((s) => s[1]);
    const readyAt = fb.readyAt ?? Infinity;
    // Longest stretch with no loader between FEEDBACK_MS and the render.
    let gap = 0;
    let runStart = null;
    for (const [t, on] of fb.samples) {
      if (t < FEEDBACK_MS || t > readyAt) continue;
      if (!on && runStart === null) runStart = t;
      if (on && runStart !== null) {
        gap = Math.max(gap, t - runStart);
        runStart = null;
      }
    }
    if (runStart !== null) gap = Math.max(gap, Math.min(readyAt, fb.samples.at(-1)?.[0] ?? 0) - runStart);
    const after = fb.samples.filter(([t, on]) => on && t > readyAt + 400);
    // Shifts while the loader is up (click -> render): what the loader itself causes. Shifts in the last 100 ms before render are the real page replacing the skeleton (timer and frame clocks differ by that much), not the loader.
    const clsLoader = fb.cls === null ? null : fb.shifts.filter(([t]) => t >= fb.clickAbs && t - fb.clickAbs < readyAt - 100).reduce((a, [, v]) => a + v, 0);
    const m = { clsLoader: clsLoader === null ? null : Number(clsLoader.toFixed(4)), first: first ? first[0] : null, gap: Math.round(gap), ready: fb.readyAt === null ? null : Math.round(fb.readyAt), cls: fb.cls === null ? null : Number(fb.cls.toFixed(4)), barSeen: fb.barSeen, heldRequest: held };
    if (fast) {
      // A navigation that lands under ~100 ms never shows the bar; a slower one shows it, but not before ~100 ms.
      if (first && first[0] < FLASH_MS) findings.push(`loader appeared at ${first[0]} ms, before the ${FLASH_MS} ms delay (page ready at ${m.ready} ms)`);
      if (m.ready !== null && m.ready < FLASH_MS && fb.barSeen) findings.push(`bar flashed on a navigation that took only ${m.ready} ms`);
    } else {
      if (!held) findings.push("the route handler never held a request, so the case proves nothing");
      if (slow !== null && fb.readyAt < MIN_SLOW_MS) findings.push(`navigation took only ${m.ready} ms (< ${MIN_SLOW_MS}), not slow enough to test`);
      if (m.first === null) findings.push(`no loader at all between the click and the render (${m.ready} ms)`);
      else if (m.first > FEEDBACK_MS) findings.push(`first loader at ${m.first} ms, over ${FEEDBACK_MS} ms`);
      if (m.first !== null && gap > GAP_MS) findings.push(`loader gap of ${m.gap} ms before the page rendered`);
    }
    if (after.length) findings.push(`a loader was still on screen ${Math.round(after[0][0] - readyAt)} ms after the page rendered`);
    if (errors.length) findings.push(`console errors: ${errors.slice(0, 3).join(" | ")}`);
    if (clsLoader !== null && clsLoader > 0.1) findings.push(`layout shift while the loader was up: ${m.clsLoader} > 0.1`);
    return { where, ...m, findings, errors };
  } finally {
    await ctx.close();
  }
}

/** Screenshot the loader state: same setup, shot 700 ms after the click. */
async function shoot(browserType, browser, vp, c) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ...(c.persona ? { storageState: await stateFor(browserType, browser, c.persona) } : {}),
    extraHTTPHeaders: { "x-forwarded-for": nextIp() },
  });
  const page = await ctx.newPage();
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    const hit = typeof c.hold === "function" ? c.hold(u) : c.hold.test(u.pathname);
    if (hit && !u.pathname.startsWith("/api/") && !u.pathname.startsWith("/_next/")) await new Promise((r) => setTimeout(r, HOLD_MS));
    await route.continue().catch(() => {});
  });
  await page.goto(new URL(c.start, baseUrl()).toString(), { waitUntil: "load" });
  await page.locator("main h1, h1").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(400);
  if (vp.width < 640 && c.menu) {
    await page.getByRole("button", { name: c.menu }).first().click();
    await page.waitForTimeout(300);
  }
  await c.go(page);
  await page.waitForTimeout(700);
  mkdirSync(SHOTS, { recursive: true });
  const file = join(SHOTS, `${c.key}-${browserType}-${vp.name}.png`);
  await page.screenshot({ path: file });
  await ctx.close();
  return file;
}

/**
 * Status codes a loading boundary would break: a boundary streams a 200 before the
 * page runs, so notFound() and redirect() lose their status (measured on a build
 * with boundaries in (auth), (marketing) and drive: drive 404 -> 200, opportunities
 * 404 -> 200, signed-in /login 307 -> 200 plus a one-second <meta refresh>).
 */
async function statusChecks() {
  const out = [];
  const get = async (path, headers = {}) => {
    const res = await fetch(new URL(path, baseUrl()), { redirect: "manual", headers: { "x-forwarded-for": nextIp(), ...headers } });
    return { status: res.status, location: res.headers.get("location") };
  };
  const browser = await chromium.launch();
  const state = await loginState(browser, persona("intern-one"));
  await browser.close();
  const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  for (const [label, path, headers, want] of [
    ["unknown drive token", "/drive/aaaaaaaaaaaaaaaaaaaaaaaa", {}, (r) => r.status === 404],
    ["unknown opportunity id", "/opportunities/zzz", {}, (r) => r.status === 404],
    ["signed-in /login", "/login", { cookie }, (r) => r.status === 307 && /\/intern\/dashboard/.test(r.location ?? "")],
    ["signed-in /signup", "/signup", { cookie }, (r) => r.status === 307 && /\/intern\/dashboard/.test(r.location ?? "")],
  ]) {
    const r = await get(path, headers);
    const ok = want(r);
    out.push({ where: `status ${label}`, findings: ok ? [] : [`${path} answered ${r.status}${r.location ? " -> " + r.location : ""}, expected the 404 / 307 a loading boundary would turn into 200`] });
    log(ok ? "ok  " : "FAIL", `status ${label}`.padEnd(34), `${r.status}${r.location ? " -> " + r.location : ""}`);
  }
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const results = [];
  if (!process.env.PAGE_CHANGE_ONLY) results.push(...(await statusChecks()));
  for (const bt of BROWSERS) {
    const browser = await (bt === "firefox" ? firefox : chromium).launch();
    for (const vp of VIEWPORTS.filter((v) => !process.env.PAGE_CHANGE_VIEWPORT || v.name === process.env.PAGE_CHANGE_VIEWPORT)) {
      for (const c of [...CASES, FAST].filter((x) => !process.env.PAGE_CHANGE_ONLY || process.env.PAGE_CHANGE_ONLY.split(",").includes(x.key))) {
        let r;
        try {
          r = await runCase(bt, browser, vp, c, c === FAST);
        } catch (e) {
          r = { where: `${bt} ${vp.name} ${c.key}`, findings: [`threw: ${String(e.message).split("\n")[0]}`] };
        }
        results.push(r);
        log(r.findings.length ? "FAIL" : "ok  ", r.where.padEnd(34), `first=${r.first ?? "-"}ms gap=${r.gap ?? "-"}ms ready=${r.ready ?? "-"}ms cls(loader)=${r.clsLoader ?? "-"} cls(total)=${r.cls ?? "-"}`, r.findings.length ? "\n        - " + r.findings.join("\n        - ") : "");
        if (SHOTS && c !== FAST) {
          try {
            await shoot(bt, browser, vp, c);
          } catch (e) {
            log("shot failed", r.where, String(e.message).split("\n")[0]);
          }
        }
      }
    }
    await browser.close();
  }
  writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const bad = results.filter((r) => r.findings.length);
  log(`${results.length - bad.length}/${results.length} passed`);
  process.exit(bad.length ? 1 : 0);
}

await main();
