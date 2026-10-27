#!/usr/bin/env node
/**
 * Slow-3G run of the three dashboards (Chromium, 390 wide, CDP throttling:
 * 400 kbit/s down, 400 kbit/s up, 400 ms RTT; CPU 4x slower).
 *
 * Per dashboard it records TTFB, FCP, LCP, DOMContentLoaded, load and bytes
 * transferred, and asserts:
 *   - no error boundary, no console errors, no failed requests from our origin;
 *   - the page's main content is visible: FAIL when nothing is painted within
 *     SLOW3G_FAIL_MS (default 30 000);
 *   - budgets (reported as findings, so they show in the ledger): FCP <= 6 s,
 *     LCP <= 12 s on slow 3G. Tune with SLOW3G_FCP_MS / SLOW3G_LCP_MS.
 *
 * Output: e2e/.artifacts/qa/slow3g/{results.json,report.md}; exit 1 on findings.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

import { ARTIFACTS, baseUrl } from "./lib/env.mjs";
import { DASHBOARDS, loginState, persona } from "./lib/session.mjs";

const OUT = join(ARTIFACTS, "qa", "slow3g");
const FAIL_MS = Number(process.env.SLOW3G_FAIL_MS || 30_000);
const FCP_BUDGET = Number(process.env.SLOW3G_FCP_MS || 6000);
const LCP_BUDGET = Number(process.env.SLOW3G_LCP_MS || 12_000);
const findings = [];
const rowsOut = [];
const log = (...a) => console.log("[slow3g]", ...a);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const d of DASHBOARDS) {
    const state = await loginState(browser, persona(d.key));
    const ctx = await browser.newContext({ storageState: state, viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      window.__lcp = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    let bytes = 0;
    const errors = [];
    cdp.on("Network.loadingFinished", (e) => { bytes += e.encodedDataLength; });
    page.on("console", (m) => m.type() === "error" && !/^Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
    const failed = [];
    page.on("response", (r) => r.url().startsWith(baseUrl()) && r.status() >= 400 && failed.push(`${r.status()} ${r.url().replace(baseUrl(), "")}`));
    page.on("requestfailed", (r) => r.url().startsWith(baseUrl()) && !/ABORTED/.test(r.failure()?.errorText ?? "") && failed.push(`${r.failure()?.errorText} ${r.url().replace(baseUrl(), "")}`));

    const where = d.path;
    const t0 = Date.now();
    let ok = true;
    try {
      await page.goto(new URL(d.path, baseUrl()).toString(), { waitUntil: "load", timeout: FAIL_MS * 2 });
    } catch (e) {
      ok = false;
      findings.push({ where, kind: "load-timeout", detail: e.message.split("\n")[0] });
    }
    const loadMs = Date.now() - t0;
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
      return { ttfb: nav?.responseStart ?? null, dcl: nav?.domContentLoadedEventEnd ?? null, fcp, lcp: window.__lcp || null, text: (document.body.innerText || "").trim().length, boundary: /something went wrong|application error/i.test(document.body.innerText || "") };
    });
    const row = { page: where, ttfbMs: Math.round(m.ttfb), fcpMs: m.fcp && Math.round(m.fcp), lcpMs: m.lcp && Math.round(m.lcp), domContentLoadedMs: Math.round(m.dcl), loadMs, transferredKB: Math.round(bytes / 1024) };
    rowsOut.push(row);
    log(JSON.stringify(row));
    await page.screenshot({ path: join(OUT, `${d.key}-390.png`) }).catch(() => {});
    if (ok && (m.fcp === null || m.fcp > FAIL_MS)) findings.push({ where, kind: "nothing-painted", detail: `no first contentful paint within ${FAIL_MS} ms` });
    if (m.boundary) findings.push({ where, kind: "error-boundary", detail: "error text on the page under slow 3G" });
    if (m.text < 100) findings.push({ where, kind: "blank-page", detail: `only ${m.text} characters of text` });
    if (m.fcp && m.fcp > FCP_BUDGET) findings.push({ where, kind: "fcp-over-budget", detail: `FCP ${Math.round(m.fcp)} ms > ${FCP_BUDGET} ms` });
    if (m.lcp && m.lcp > LCP_BUDGET) findings.push({ where, kind: "lcp-over-budget", detail: `LCP ${Math.round(m.lcp)} ms > ${LCP_BUDGET} ms` });
    for (const e of errors) findings.push({ where, kind: "console-error", detail: e });
    for (const f of failed) findings.push({ where, kind: "failed-request", detail: f });
    await ctx.close();
  }
  await browser.close();
  writeFileSync(join(OUT, "results.json"), JSON.stringify({ rows: rowsOut, findings }, null, 2));
  writeFileSync(join(OUT, "report.md"), ["# Slow 3G (400 kbit/s, 400 ms RTT, CPU 4x), 390 px", "", "| page | TTFB | FCP | LCP | DCL | load | KB |", "|---|---|---|---|---|---|---|", ...rowsOut.map((r) => `| ${r.page} | ${r.ttfbMs} | ${r.fcpMs} | ${r.lcpMs} | ${r.domContentLoadedMs} | ${r.loadMs} | ${r.transferredKB} |`), "", findings.length ? "## Findings" : "No findings.", ...findings.map((f) => `- **${f.where}** ${f.kind}: ${f.detail}`)].join("\n") + "\n");
  log(`${findings.length} findings; report ${join(OUT, "report.md")}`);
  process.exit(findings.length ? 1 : 0);
}
main().catch((e) => { console.error("[slow3g] FAILED:", e); process.exit(2); });
