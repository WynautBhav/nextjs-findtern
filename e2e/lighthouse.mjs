#!/usr/bin/env node
/**
 * Lighthouse CI (@lhci/cli) on the three dashboards, mobile preset (Lighthouse's
 * default: Moto G Power class phone, simulated slow-4G, 4x CPU). Signed in with
 * the persona's session cookie sent as an extra header.
 *
 * LH_RUNS (default 3) runs per page; the median performance and accessibility
 * scores are recorded in docs/qa/lighthouse.md and checked against the release
 * targets (performance >= 85, accessibility >= 95). Exit 1 when a target is missed.
 * A run that did not end on the requested URL (session rejected → login page)
 * is an error, not a score.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

import { ARTIFACTS, ROOT, baseUrl } from "./lib/env.mjs";
import { DASHBOARDS, cookieHeader, loginState, persona } from "./lib/session.mjs";

const OUT = join(ARTIFACTS, "qa", "lighthouse");
const RUNS = Number(process.env.LH_RUNS || 3);
const TARGET = { performance: 85, accessibility: 95 };
const log = (...a) => console.log("[lighthouse]", ...a);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const chromePath = chromium.executablePath();
  const results = [];
  let failed = false;

  for (const d of DASHBOARDS) {
    const state = await loginState(browser, persona(d.key));
    const dir = join(OUT, d.key);
    mkdirSync(dir, { recursive: true });
    const rc = {
      ci: {
        collect: {
          url: [new URL(d.path, baseUrl()).toString()],
          numberOfRuns: RUNS,
          chromePath,
          settings: {
            formFactor: "mobile",
            screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
            extraHeaders: { Cookie: cookieHeader(state) },
            onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
            chromeFlags: "--headless=new --no-sandbox --disable-gpu",
          },
        },
      },
    };
    const cfg = join(dir, "lighthouserc.json");
    writeFileSync(cfg, JSON.stringify(rc, null, 2));
    log(`${d.path}: ${RUNS} runs`);
    const r = spawnSync(join(ROOT, "node_modules", ".bin", "lhci"), ["collect", `--config=${cfg}`], { cwd: dir, stdio: "inherit", env: { ...process.env, CI: "1" } });
    const lhrs = readdirSync(join(dir, ".lighthouseci")).filter((f) => /^lhr-.*\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(dir, ".lighthouseci", f), "utf8")));
    if (r.status !== 0 || !lhrs.length) {
      results.push({ path: d.path, error: `lhci collect exited ${r.status}, ${lhrs.length} reports` });
      failed = true;
      continue;
    }
    const wrongPage = lhrs.filter((l) => new URL(l.finalDisplayedUrl).pathname !== d.path);
    if (wrongPage.length) {
      results.push({ path: d.path, error: `${wrongPage.length}/${lhrs.length} runs ended on ${new URL(wrongPage[0].finalDisplayedUrl).pathname}, not ${d.path} (session rejected?)` });
      failed = true;
      continue;
    }
    const score = (l, c) => Math.round((l.categories[c]?.score ?? 0) * 100);
    const m = (c) => median(lhrs.map((l) => score(l, c)));
    const metric = (id) => Math.round(median(lhrs.map((l) => l.audits[id]?.numericValue ?? 0)));
    const failing = (cat) => [...new Set(lhrs.flatMap((l) => (l.categories[cat].auditRefs ?? []).filter((a) => a.weight > 0 && l.audits[a.id].score !== null && l.audits[a.id].score < 0.9).map((a) => `${a.id}`)))];
    const row = {
      path: d.path, runs: lhrs.length, performance: m("performance"), accessibility: m("accessibility"), bestPractices: m("best-practices"), seo: m("seo"),
      fcpMs: metric("first-contentful-paint"), lcpMs: metric("largest-contentful-paint"), tbtMs: metric("total-blocking-time"), cls: Math.round(median(lhrs.map((l) => l.audits["cumulative-layout-shift"]?.numericValue ?? 0)) * 1000) / 1000,
      perfAuditsBelow90: failing("performance"), a11yAuditsBelow90: failing("accessibility"),
    };
    results.push(row);
    if (row.performance < TARGET.performance || row.accessibility < TARGET.accessibility) failed = true;
    log(`${d.path}: performance ${row.performance}, accessibility ${row.accessibility}`);
  }
  await browser.close();

  const md = [
    "# Lighthouse (mobile preset: mid-range phone, simulated slow 4G, 4x CPU)",
    "",
    `Median of ${RUNS} runs per page, signed in, QA data. Targets: performance >= ${TARGET.performance}, accessibility >= ${TARGET.accessibility}.`,
    `Run on ${new Date().toISOString().slice(0, 10)} against \`npm run qa lighthouse\`; commit ${spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).stdout.toString().trim()}.`,
    "",
    "| page | perf | a11y | best practices | SEO | FCP ms | LCP ms | TBT ms | CLS | result |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...results.map((r) => r.error ? `| \`${r.path}\` | | | | | | | | | ERROR: ${r.error} |` : `| \`${r.path}\` | ${r.performance} | ${r.accessibility} | ${r.bestPractices} | ${r.seo} | ${r.fcpMs} | ${r.lcpMs} | ${r.tbtMs} | ${r.cls} | ${r.performance >= TARGET.performance && r.accessibility >= TARGET.accessibility ? "meets targets" : "BELOW TARGET"} |`),
    "",
    ...results.filter((r) => !r.error).flatMap((r) => [`**\`${r.path}\`** performance audits under 0.9: ${r.perfAuditsBelow90.join(", ") || "none"}; accessibility audits under 0.9: ${r.a11yAuditsBelow90.join(", ") || "none"}.`, ""]),
  ].join("\n");
  mkdirSync(join(ROOT, "docs", "qa"), { recursive: true });
  writeFileSync(join(ROOT, "docs", "qa", "lighthouse.md"), md);
  writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
  log(`wrote docs/qa/lighthouse.md`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[lighthouse] FAILED:", e); process.exit(2); });
