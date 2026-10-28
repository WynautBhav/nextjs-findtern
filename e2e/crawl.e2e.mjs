#!/usr/bin/env node
/**
 * Route crawler. Signs in as each persona (lib/personas.mjs) and visits every
 * route of the app (lib/routes.mjs: derived from src/app, dynamic ids from the
 * QA database), at every width, and asserts per page × width:
 *
 *   - no Next error boundary / "Something went wrong"
 *   - no console errors, uncaught page errors
 *   - no 4xx/5xx from our origin, no failed requests from our origin
 *   - document.scrollWidth <= innerWidth + 1
 *   - axe: 0 serious / critical (WCAG 2.0/2.1 A + AA)
 *
 * Plus an access probe: signed out, and each role against the other roles'
 * routes, must not render the page.
 *
 * Normally run through `npm run qa`, which starts the server. Standalone:
 *   DATABASE_URL=<loopback> E2E_BASE_URL=http://localhost:3500 node e2e/crawl.e2e.mjs [--quick] [--browsers=chromium,webkit,firefox]
 *     [--personas=intern-hired,admin] [--widths=375,1440] [--only=/admin/] [--no-axe]
 *
 * Output: e2e/.artifacts/qa/crawl/{results.json,report.md,shots/,traces/}
 * Exit code 1 when there is any finding.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { chromium, firefox, webkit } from "playwright";

import { ARTIFACTS, baseUrl } from "./lib/env.mjs";
import { closeDb } from "./lib/db.mjs";
import { LOGIN, MAIN_KEYS, PERSONAS } from "./lib/personas.mjs";
import { appRoutes, dynamicValues, fill, isDynamic, roleOf, situationIds } from "./lib/routes.mjs";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const flag = (name) => process.argv.includes(`--${name}`);

const QUICK = flag("quick");
export const ALL_WIDTHS = [360, 375, 393, 412, 768, 1024, 1280, 1440, 1920];
const MAIN_WIDTHS = arg("widths")?.split(",").map(Number) ?? (QUICK ? [375, 1440] : ALL_WIDTHS);
const SITUATION_WIDTHS = arg("widths")?.split(",").map(Number) ?? (QUICK ? [375, 1440] : [375, 768, 1440]);
const EXTRA_ID_WIDTHS = [375, 1440];
const BROWSERS = (arg("browsers") ?? "chromium,webkit,firefox").split(",");
// Browser coverage from the brief: Chromium everywhere, WebKit at 375 + 1440, Firefox at 1440.
// QA_ALL_WIDTHS=1 (release gate): WebKit and Firefox run the same widths as Chromium.
const BROWSER_WIDTHS = process.env.QA_ALL_WIDTHS === "1" ? {} : { chromium: null, webkit: [375, 1440], firefox: [1440] };
const AXE = !flag("no-axe");
const TRACE = process.env.QA_TRACE !== "0";
const CONCURRENCY = Number(process.env.QA_CONCURRENCY || 4);
const ONLY = arg("only");
const OUT = join(ARTIFACTS, "qa", "crawl");
const ORIGIN = baseUrl();

const LAUNCHERS = { chromium, webkit, firefox };

/** The login budget is 8 per 15 minutes per IP bucket; TRUST_PROXY=1 on the QA server lets each login carry its own. */
let ipSeq = 10;
const nextIp = () => `10.77.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`;

const log = (...a) => console.log("[crawl]", ...a);
const findings = [];
let pagesChecked = 0;

const slug = (s) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "root";

async function login(browserType, persona) {
  const browser = browserType;
  const ctx = await browser.newContext();
  const spec = LOGIN[persona.role];
  const res = await ctx.request.post(new URL(spec.api, ORIGIN).toString(), {
    data: spec.body(persona),
    headers: { "x-forwarded-for": nextIp(), "content-type": "application/json" },
  });
  if (!res.ok()) {
    const detail = `login ${persona.key} → HTTP ${res.status()} ${(await res.text()).slice(0, 200)}`;
    await ctx.close();
    throw new Error(detail);
  }
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

const BOUNDARY_PATTERNS = [
  /something went wrong/i,
  /application error: a (client|server)-side exception/i,
  /this page couldn.t load/i,
  /unhandled runtime error/i,
];

async function pageOverflow(page) {
  return page.evaluate(() => {
    const iw = window.innerWidth;
    const sw = document.documentElement.scrollWidth;
    if (sw <= iw + 1) return null;
    const culprits = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > iw + 1) {
        const cs = getComputedStyle(el);
        if (cs.position === "fixed") continue;
        const id = el.id ? `#${el.id}` : "";
        const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
        culprits.push({ sel: `${el.tagName.toLowerCase()}${id}${cls}`, right: Math.round(r.right) });
      }
    }
    culprits.sort((a, b) => b.right - a.right);
    return { scrollWidth: sw, innerWidth: iw, culprits: culprits.slice(0, 3) };
  });
}

/** Visit one URL in a page that already has listeners attached; returns this visit's findings. */
async function visit(page, bag, meta, path) {
  bag.length = 0;
  const found = [];
  const add = (kind, detail, extra = {}) => found.push({ ...meta, route: meta.route, url: path, kind, detail, ...extra });

  let res = null;
  try {
    res = await page.goto(new URL(path, ORIGIN).toString(), { waitUntil: "load", timeout: 30_000 });
  } catch (e) {
    add("nav-failure", e.message.split("\n")[0]);
  }
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);

  const landed = new URL(page.url());
  const status = res?.status() ?? 0;
  if (status >= 400) add("http-status", `document ${status}`, { status });
  const finalPath = landed.pathname + landed.search;

  const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
  for (const re of BOUNDARY_PATTERNS) if (re.test(text)) add("error-boundary", `page text matches ${re}`);
  if (!text.trim() && status < 400) add("blank-page", "document body has no text");

  for (const item of bag) {
    if (item.kind === "response" && item.status >= 400) add("http-status", `${item.status} ${item.method} ${item.url}`, { status: item.status });
    else if (item.kind === "requestfailed") add("request-failed", `${item.method} ${item.url}: ${item.error}`);
    else if (item.kind === "console") add("console-error", item.text.slice(0, 400));
    else if (item.kind === "pageerror") add("page-error", item.text.slice(0, 400));
  }

  const overflow = await pageOverflow(page).catch(() => null);
  if (overflow) add("overflow", `scrollWidth ${overflow.scrollWidth} > innerWidth ${overflow.innerWidth}: ${overflow.culprits.map((c) => `${c.sel}→${c.right}`).join(", ")}`);

  if (AXE && status < 400) {
    try {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of r.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
        add("axe", `${v.impact} ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"}) e.g. ${v.nodes[0]?.target?.join(" ")}`, { rule: v.id, impact: v.impact });
      }
    } catch (e) {
      add("axe-error", e.message.split("\n")[0]);
    }
  }
  return { found, finalPath, status };
}

function attachListeners(page, bag) {
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/^Failed to load resource/.test(t)) return; // reported with its URL by the response listener
    bag.push({ kind: "console", text: t });
  });
  page.on("pageerror", (e) => bag.push({ kind: "pageerror", text: String(e.message ?? e) }));
  page.on("response", (r) => {
    if (r.url().startsWith(ORIGIN) && r.status() >= 400) bag.push({ kind: "response", status: r.status(), method: r.request().method(), url: r.url().replace(ORIGIN, "") });
  });
  page.on("requestfailed", (rq) => {
    if (!rq.url().startsWith(ORIGIN)) return;
    const err = rq.failure()?.errorText ?? "failed";
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled|Load request cancelled/i.test(err)) return; // navigations / prefetch cancelled by the next navigation
    bag.push({ kind: "requestfailed", method: rq.method(), url: rq.url().replace(ORIGIN, ""), error: err });
  });
}

/** One browser × persona × width: a fresh context, every route in order. */
async function runUnit({ browserName, persona, state, width, jobs }) {
  const browser = await LAUNCHERS[browserName].launch();
  const mobile = width <= 768 && browserName !== "firefox";
  const ctx = await browser.newContext({
    storageState: state ?? undefined,
    viewport: { width, height: width <= 768 ? 800 : 900 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
  });
  if (TRACE) await ctx.tracing.start({ screenshots: true, snapshots: true });
  const page = await ctx.newPage();
  const bag = [];
  attachListeners(page, bag);
  const unitFindings = [];
  for (const job of jobs) {
    const meta = { persona: persona?.key ?? "signed-out", role: persona?.role ?? "none", route: job.route, width, browser: browserName };
    if (TRACE) await ctx.tracing.startChunk().catch(() => {});
    const { found, finalPath } = await visit(page, bag, meta, job.path);
    pagesChecked++;
    if (found.length) {
      const base = `${slug(meta.persona)}__${slug(job.path)}__${width}__${browserName}`;
      mkdirSync(join(OUT, "shots"), { recursive: true });
      mkdirSync(join(OUT, "traces"), { recursive: true });
      const shot = join("shots", `${base}.png`);
      await page.screenshot({ path: join(OUT, shot), fullPage: true }).catch(() => {});
      let trace = null;
      if (TRACE) {
        trace = join("traces", `${base}.zip`);
        await ctx.tracing.stopChunk({ path: join(OUT, trace) }).catch(() => (trace = null));
      }
      for (const f of found) unitFindings.push({ ...f, finalPath, screenshot: shot, trace });
    } else if (TRACE) {
      await ctx.tracing.stopChunk().catch(() => {});
    }
  }
  await ctx.close();
  await browser.close();
  return unitFindings;
}

async function pool(items, n, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) {
      const it = queue.shift();
      try {
        await fn(it);
      } catch (e) {
        findings.push({ kind: "harness-error", detail: `${it.label}: ${e.message}`, persona: it.persona?.key ?? "-", route: "-", width: it.width, browser: it.browserName });
        log("harness error", it.label, e.message);
      }
    }
  });
  await Promise.all(workers);
}

/** Protected routes must not render for the wrong visitor. */
async function accessProbe(routes, states) {
  const staticRoutes = routes.filter((r) => !isDynamic(r));
  const browser = await chromium.launch();
  const visitors = [{ key: "signed-out", role: "none", state: null }, ...PERSONAS.filter((p) => MAIN_KEYS.includes(p.key)).map((p) => ({ key: p.key, role: p.role, state: states.chromium?.[p.key] }))];
  for (const v of visitors) {
    const ctx = await browser.newContext({ storageState: v.state ?? undefined, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    for (const route of staticRoutes) {
      const need = roleOf(route);
      if (need === "public" || need === v.role) continue;
      const bag = [];
      const res = await page.goto(new URL(route, ORIGIN).toString(), { waitUntil: "load", timeout: 30_000 }).catch(() => null);
      void bag;
      const landed = new URL(page.url()).pathname;
      const status = res?.status() ?? 0;
      const blocked = landed !== route || status === 401 || status === 403 || status === 404;
      pagesChecked++;
      if (!blocked) findings.push({ kind: "access-leak", detail: `${v.key} (${v.role}) rendered ${route} meant for ${need} (status ${status})`, persona: v.key, role: v.role, route, width: 1280, browser: "chromium", url: route });
      else if (status >= 500) findings.push({ kind: "http-status", detail: `access probe ${v.key} → ${route} gave ${status}`, persona: v.key, role: v.role, route, width: 1280, browser: "chromium", url: route, status });
    }
    await ctx.close();
  }
  await browser.close();
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const ids = await situationIds();
  let routes = appRoutes();
  if (ONLY) routes = routes.filter((r) => r.includes(ONLY));
  log(`${routes.length} routes from src/app; origin ${ORIGIN}; browsers ${BROWSERS.join(",")}`);

  const personas = PERSONAS.filter((p) => !arg("personas") || arg("personas").split(",").includes(p.key));

  // Log in once per browser × persona.
  const states = {};
  for (const b of BROWSERS) {
    const browser = await LAUNCHERS[b].launch().catch((e) => {
      findings.push({ kind: "harness-error", detail: `${b} cannot launch: ${e.message.split("\n").find((l) => l.trim()) ?? e.message}`, persona: "-", route: "-", width: 0, browser: b });
      log(`SKIP ${b}: cannot launch (${e.message.split("\n")[0]})`);
      return null;
    });
    if (!browser) continue;
    states[b] = {};
    for (const p of personas) {
      // Situation personas are only logged in on Chromium.
      if (b !== "chromium" && !MAIN_KEYS.includes(p.key)) continue;
      try {
        states[b][p.key] = await login(browser, p);
      } catch (e) {
        findings.push({ kind: "harness-error", detail: e.message, persona: p.key, route: "-", width: 0, browser: b });
        log("login failed", p.key, e.message);
      }
    }
    await browser.close();
  }

  // Build units: browser × persona × width, each with its route jobs.
  const units = [];
  for (const b of BROWSERS) {
    if (!states[b]) continue;
    for (const persona of [null, ...personas]) {
      if (b !== "chromium" && persona && !MAIN_KEYS.includes(persona.key)) continue;
      if (persona && !states[b][persona.key]) continue;
      const main = persona === null || MAIN_KEYS.includes(persona.key);
      let widths = main ? MAIN_WIDTHS : SITUATION_WIDTHS;
      if (BROWSER_WIDTHS[b]) widths = BROWSER_WIDTHS[b].filter((w) => widths.includes(w) || !arg("widths"));
      // The signed-out visitor needs one pass; it is the "public" set.
      const role = persona?.role ?? "public";
      const wanted = routes.filter((r) => (role === "public" ? roleOf(r) === "public" : roleOf(r) === role));
      const primary = [];
      const extra = [];
      for (const r of wanted) {
        if (!isDynamic(r)) {
          primary.push({ route: r, path: r });
          continue;
        }
        const vals = await dynamicValues(r, persona, ids);
        vals.forEach((v, i) => (i === 0 ? primary : extra).push({ route: r, path: fill(r, v) }));
        if (!vals.length) findings.push({ kind: "harness-error", detail: `no database row to fill ${r} for ${persona?.key ?? "public"}`, persona: persona?.key ?? "signed-out", route: r, width: 0, browser: b });
      }
      for (const width of widths) {
        const jobs = [...primary, ...(EXTRA_ID_WIDTHS.includes(width) ? extra : [])];
        if (!jobs.length) continue;
        units.push({ browserName: b, persona, state: persona ? states[b][persona.key] : null, width, jobs, label: `${b}/${persona?.key ?? "signed-out"}/${width}` });
      }
    }
  }
  log(`${units.length} units, ${units.reduce((n, u) => n + u.jobs.length, 0)} page visits queued (concurrency ${CONCURRENCY})`);

  const started = Date.now();
  let done = 0;
  await pool(units, CONCURRENCY, async (u) => {
    const f = await runUnit(u);
    findings.push(...f);
    done++;
    log(`[${done}/${units.length}] ${u.label}: ${u.jobs.length} pages, ${f.length} findings`);
  });

  if (!ONLY) await accessProbe(routes, states);
  await closeDb();
  report(Date.now() - started);
}

function report(ms) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "results.json"), JSON.stringify({ pagesChecked, findings }, null, 2));
  // Group repeats: same persona/route/kind/detail across widths and browsers is one defect.
  const groups = new Map();
  for (const f of findings) {
    const norm = f.detail.replace(/\d{4,}/g, "N").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "UUID");
    const key = [f.kind, f.persona, f.route, norm].join("|");
    const g = groups.get(key) ?? { ...f, widths: new Set(), browsers: new Set(), count: 0 };
    g.widths.add(f.width);
    g.browsers.add(f.browser);
    g.count++;
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.route.localeCompare(b.route));
  const lines = [
    `# Crawl report`,
    ``,
    `${pagesChecked} page visits in ${(ms / 60000).toFixed(1)} min; ${findings.length} raw findings, ${list.length} distinct.`,
    ``,
    `| kind | persona | route | widths | browsers | detail | screenshot | trace |`,
    `|---|---|---|---|---|---|---|---|`,
    ...list.map((g) => `| ${g.kind} | ${g.persona} | \`${g.url ?? g.route}\` | ${[...g.widths].sort((a, b) => a - b).join(",")} | ${[...g.browsers].join(",")} | ${g.detail.replace(/\|/g, "\\|").slice(0, 220)} | ${g.screenshot ?? ""} | ${g.trace ?? ""} |`),
  ];
  writeFileSync(join(OUT, "report.md"), lines.join("\n") + "\n");
  const byKind = {};
  for (const g of list) byKind[g.kind] = (byKind[g.kind] ?? 0) + 1;
  log(`DONE: ${pagesChecked} page visits, ${findings.length} raw findings, ${list.length} distinct`, JSON.stringify(byKind));
  log(`report: ${join(OUT, "report.md")}`);
  process.exitCode = findings.length ? 1 : 0;
}

main().catch(async (e) => {
  console.error("[crawl] FAILED:", e);
  await closeDb();
  process.exit(2);
});
