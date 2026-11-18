#!/usr/bin/env node
/**
 * Route sweep: log in as each role on a LOCAL scratch database, visit every
 * gated page, and record per route: HTTP status, console errors, failed
 * requests, horizontal overflow, an axe-core violation count and screenshots
 * at 1440x900 and 390x844. Then probe the access-control matrix (every role,
 * and a guest, requesting every other role's pages: expect 3xx/401/403/404,
 * never 200).
 *
 *   # scratch Postgres + seeded DB (scripts/seed.ts, scripts/seed-colleges.ts,
 *   # e2e/seed-situations.mjs --no-scrub), `next build && next start -p 3150`
 *   DATABASE_URL=postgresql://findtern@127.0.0.1:54350/findtern_f1 \
 *   SWEEP_BASE=http://127.0.0.1:3150 node scripts/route-sweep.mjs
 *
 * Env (all optional):
 *   SWEEP_BASE    app origin (default http://127.0.0.1:3150); must be loopback
 *   DATABASE_URL  scratch DB, loopback only (real ids for [id] routes)
 *   SWEEP_OUT     output dir (default ~/hermes-team/artifacts/findtern-ui/baseline)
 *   SWEEP_ROLES   comma list, default intern,employer,college,admin
 *   SWEEP_ONLY    substring filter on route paths
 *   SWEEP_NOSHOTS 1 skips screenshots (status/console/axe/matrix only)
 *   SWEEP_SKIP_MATRIX 1 skips the access-control matrix
 *   CHROME        chromium executable (default: Playwright's own)
 *
 * Writes <out>/results.json (read by e2e/route-sweep/build-report.mjs) and the
 * screenshots <out>/<role>/<route-slug>-{desktop,mobile}.jpg. Prints a summary
 * and exits 1 on any 5xx, console error, failed request or access-control FAIL.
 * It never touches a non-loopback host.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";

import { appRoutes, dynamicValues, fill, isDynamic, roleOf, situationIds } from "../e2e/lib/routes.mjs";
import { closeDb, rows } from "../e2e/lib/db.mjs";
import { SWEEP_PERSONAS } from "../e2e/route-sweep/personas.mjs";

const require = createRequire(import.meta.url);
const AXE_PATH = (() => {
  try {
    return require.resolve("axe-core/axe.min.js");
  } catch {
    return null;
  }
})();

const BASE = process.env.SWEEP_BASE || "http://127.0.0.1:3150";
const OUT = process.env.SWEEP_OUT || join(homedir(), "hermes-team/artifacts/findtern-ui/baseline");
const ROLES = (process.env.SWEEP_ROLES || "intern,employer,college,admin").split(",");
const ONLY = process.env.SWEEP_ONLY || "";
const SHOTS = process.env.SWEEP_NOSHOTS !== "1";
const VIEWS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const SHOT_MAX_H = 2000; // vision models misread very tall images
const SKIP_REMOVED = /^\/(employer|intern)\/messages(\/|$)/; // deleted by the messaging-removal package

if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(BASE).hostname)) {
  console.error(`refusing: SWEEP_BASE ${BASE} is not loopback`);
  process.exit(2);
}

const log = (...a) => console.error("[sweep]", ...a);
const slug = (route) => route.replace(/^\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "home";
let ipSeq = 1000 + Math.floor(Math.random() * 50000);
const nextIp = () => `10.91.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`;

/** Sign in through the role's login API; returns Playwright storageState. */
async function login(browser, p) {
  const ctx = await browser.newContext();
  const res = await ctx.request.post(new URL(p.api, BASE).toString(), {
    data: { email: p.email, password: p.password },
    headers: { "x-forwarded-for": nextIp(), "content-type": "application/json" },
  });
  if (!res.ok()) {
    const msg = `login ${p.email} -> HTTP ${res.status()} ${(await res.text()).slice(0, 160)}`;
    await ctx.close();
    throw new Error(msg);
  }
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

/** [id] routes e2e/lib/routes.mjs has no resolver for. */
async function extraValues(route, persona) {
  const col = async (sql, params = []) => (await rows(sql, params)).map((r) => r.v).filter(Boolean);
  if (route === "/employer/projects/[id]/edit")
    return col(`SELECT p.id AS v FROM projects p JOIN employers e ON e.id = p.employer_id WHERE lower(e.company_email) = lower($1) AND p.status = 'active' ORDER BY p.created_at LIMIT 1`, [persona.email]);
  if (route === "/intern/opportunities/[id]") return col(`SELECT id AS v FROM projects WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`);
  return [];
}

/** Every gated route for a role: static paths, plus [id] routes filled with real ids from the DB. */
async function routesFor(role, persona, ids) {
  const out = [];
  for (const route of appRoutes()) {
    // roleOf() is prefix-based: /employers and /employer-terms-and-conditions are public marketing pages
    if (roleOf(route) !== role || SKIP_REMOVED.test(route) || !(route === `/${role}` || route.startsWith(`/${role}/`))) continue;
    if (ONLY && !route.includes(ONLY)) continue;
    if (!isDynamic(route)) {
      out.push({ route, url: route });
      continue;
    }
    let values = [];
    try {
      values = (await dynamicValues(route, persona, ids)).filter(Boolean);
      if (!values.length) values = await extraValues(route, persona);
    } catch (e) {
      log(`ids for ${route}: ${e.message}`);
    }
    if (!values.length) out.push({ route, url: null, note: "no id in the scratch DB" });
    else out.push({ route, url: fill(route, values[0]) });
  }
  return out;
}

const IGNORED_FAILURE = /net::ERR_ABORTED|_rsc=|\/_next\/image/; // prefetch cancellations on navigation

async function visit(ctx, url, view, shot) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  const failed = [];
  let throttled = 0;
  page.on("response", (r) => {
    if (r.status() === 429 && r.url().includes("/api/presence/heartbeat")) throttled++;
  });
  page.on("console", (m) => {
    // the per-user presence heartbeat limiter trips when the sweep loads pages back to back: sweep noise, not an app error
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => consoleErrors.push(`uncaught: ${String(e.message).slice(0, 300)}`));
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText ?? "failed";
    if (!IGNORED_FAILURE.test(why + r.url())) failed.push(`${r.method()} ${new URL(r.url()).pathname} ${why}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && r.request().resourceType() !== "document" && !(r.status() === 429 && r.url().includes("/api/presence/heartbeat"))) failed.push(`${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`);
  });
  const rec = { view };
  try {
    const res = await page.goto(new URL(url, BASE).toString(), { waitUntil: "load", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(700); // let entrance animations settle
    rec.status = res?.status() ?? 0;
    const final = new URL(page.url());
    rec.finalPath = final.pathname + final.search;
    rec.title = await page.title();
    rec.metrics = await page.evaluate(() => ({
      h1: document.querySelectorAll("h1").length,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).length,
      textChars: (document.body.innerText || "").trim().length,
      bodyHead: (document.body.innerText || "").trim().slice(0, 140).replace(/\s+/g, " "),
    }));
    const redirected = rec.finalPath.split("?")[0] !== url.split("?")[0];
    if (!redirected && AXE_PATH && view === "desktop") {
      try {
        await page.addScriptTag({ path: AXE_PATH });
        const r = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }));
        const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
        for (const v of r.violations) byImpact[v.impact ?? "minor"]++;
        rec.axe = { byImpact, rules: r.violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => `${v.id}(${v.nodes.length})`) };
      } catch (e) {
        rec.axe = { error: String(e.message).slice(0, 120) };
      }
    }
    if (shot && SHOTS && !redirected && rec.status < 400) {
      mkdirSync(join(shot, ".."), { recursive: true });
      const h = Math.min(rec.metrics.scrollH, SHOT_MAX_H);
      await page.screenshot({ path: shot, type: "jpeg", quality: 72, fullPage: true, clip: { x: 0, y: 0, width: VIEWS[view].width, height: h } });
      rec.shot = shot;
      rec.shotCropped = rec.metrics.scrollH > SHOT_MAX_H;
    }
  } catch (e) {
    rec.error = String(e.message).slice(0, 200);
  }
  // drop the 429 console lines that belong to the throttled heartbeat (decided after load: event order is not guaranteed)
  rec.throttledHeartbeats = throttled;
  rec.consoleErrors = [...new Set(consoleErrors.filter((t) => !(throttled > 0 && /status of 429/.test(t))))];
  rec.failedRequests = [...new Set(failed)];
  await page.close();
  return rec;
}

const classify = (status, loc) => {
  if (status >= 300 && status < 400) return { verdict: "pass", how: `redirect -> ${loc}` };
  if ([401, 403, 404].includes(status)) return { verdict: "pass", how: String(status) };
  if (status === 200) return { verdict: "FAIL", how: "200 with content" };
  return { verdict: status >= 500 ? "ERROR" : "review", how: String(status) };
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ids = await situationIds().catch(() => ({}));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined });
  const states = {};
  const results = { base: BASE, startedAt: new Date().toISOString(), axe: Boolean(AXE_PATH), routes: [], matrix: [], notLoaded: [] };

  for (const role of ROLES) {
    try {
      states[role] = await login(browser, SWEEP_PERSONAS[role]);
    } catch (e) {
      results.notLoaded.push({ role, error: e.message });
      log(`${role}: ${e.message}`);
    }
  }

  const plan = {}; // role -> [{route,url,note}]
  for (const role of ROLES) plan[role] = await routesFor(role, SWEEP_PERSONAS[role], ids);

  for (const role of ROLES) {
    if (!states[role]) continue;
    const ctxs = {};
    for (const [view, size] of Object.entries(VIEWS)) ctxs[view] = await browser.newContext({ storageState: states[role], viewport: size });
    for (const item of plan[role]) {
      if (!item.url) {
        results.routes.push({ role, route: item.route, notLoaded: item.note });
        continue;
      }
      const entry = { role, route: item.route, url: item.url, views: {} };
      for (const view of Object.keys(VIEWS)) {
        const shot = join(OUT, role, `${slug(item.route)}-${view}.jpg`);
        entry.views[view] = await visit(ctxs[view], item.url, view, shot);
      }
      const d = entry.views.desktop;
      entry.redirectedTo = d.finalPath && d.finalPath.split("?")[0] !== item.url.split("?")[0] ? d.finalPath : null;
      results.routes.push(entry);
      log(`${role} ${item.url} -> ${d.status ?? d.error}${entry.redirectedTo ? ` (redirect ${entry.redirectedTo})` : ""} console=${d.consoleErrors?.length ?? "?"} failed=${d.failedRequests?.length ?? "?"}`);
    }
    for (const c of Object.values(ctxs)) await c.close();
  }

  if (process.env.SWEEP_SKIP_MATRIX !== "1") {
    // role under test (or guest) x every OTHER role's concrete pages, no redirects followed
    const actors = [...ROLES.filter((r) => states[r]), "guest"];
    for (const actor of actors) {
      const ctx = await browser.newContext(actor === "guest" ? {} : { storageState: states[actor] });
      for (const owner of ROLES) {
        if (owner === actor) continue;
        for (const item of plan[owner]) {
          if (!item.url) continue;
          const res = await ctx.request.get(new URL(item.url, BASE).toString(), { maxRedirects: 0, failOnStatusCode: false, headers: { "x-forwarded-for": nextIp() } });
          const c = classify(res.status(), res.headers().location ?? "");
          results.matrix.push({ actor, owner, path: item.url, status: res.status(), ...c });
        }
      }
      await ctx.close();
    }
    log(`matrix: ${results.matrix.length} probes, ${results.matrix.filter((m) => m.verdict === "FAIL").length} FAIL`);
  }

  await browser.close();
  await closeDb().catch(() => {});
  results.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));

  const loaded = results.routes.filter((r) => r.views);
  const bad = loaded.filter((r) => r.views.desktop.status >= 500 || r.views.desktop.consoleErrors?.length || r.views.desktop.failedRequests?.length || r.views.desktop.error);
  const fails = results.matrix.filter((m) => m.verdict === "FAIL" || m.verdict === "ERROR");
  console.log(`routes ${results.routes.length} (loaded ${loaded.length}, redirect-only ${loaded.filter((r) => r.redirectedTo).length}, not loaded ${results.routes.length - loaded.length + results.notLoaded.length})`);
  console.log(`routes with 5xx/console/failed-request/error: ${bad.length}`);
  console.log(`access-control probes ${results.matrix.length}, FAIL/ERROR ${fails.length}`);
  console.log(`wrote ${join(OUT, "results.json")}`);
  process.exit(bad.length || fails.length || results.notLoaded.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
