#!/usr/bin/env node
/**
 * Builds REPORT.md from <out>/results.json (written by scripts/route-sweep.mjs)
 * and an optional <out>/scores.json of human/vision ratings:
 *
 *   { "<role>:<route>": { "hierarchy":1-5, "craft":1-5, "distinct":1-5, "tells":"...", "bugs":"..." }, ... }
 *
 *   node e2e/route-sweep/build-report.mjs [outDir]
 *
 * Routes are sorted worst first (5xx/error, console errors, failed requests,
 * critical/serious axe, then lowest mean score). Unrated routes sort by
 * measured problems only.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const OUT = process.argv[2] || process.env.SWEEP_OUT || join(homedir(), "hermes-team/artifacts/findtern-ui/baseline");
const results = JSON.parse(readFileSync(join(OUT, "results.json"), "utf8"));
const scores = existsSync(join(OUT, "scores.json")) ? JSON.parse(readFileSync(join(OUT, "scores.json"), "utf8")) : {};
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const mean = (s) => (s ? (s.hierarchy + s.craft + s.distinct) / 3 : null);

const rows = results.routes.map((r) => {
  const key = `${r.role}:${r.route}`;
  const s = scores[key];
  if (!r.views) return { r, key, s, severity: 1000, status: "not loaded", cons: "-", failed: "-", axe: "-", ovf: "-" };
  const d = r.views.desktop;
  const m = r.views.mobile;
  const axe = d.axe?.byImpact;
  const crit = axe ? axe.critical + axe.serious : 0;
  const cons = (d.consoleErrors?.length ?? 0) + (m.consoleErrors?.length ?? 0);
  const failed = (d.failedRequests?.length ?? 0) + (m.failedRequests?.length ?? 0);
  const severity = (d.status >= 500 || d.error ? 1000 : 0) + (d.status >= 400 ? 500 : 0) + cons * 50 + failed * 40 + crit * 10 + (d.metrics?.overflowX ? 15 : 0) + (m.metrics?.overflowX ? 15 : 0) + (s ? (5 - mean(s)) * 8 : 0);
  return {
    r, key, s, severity,
    status: r.redirectedTo ? `${d.status} -> ${r.redirectedTo}` : String(d.status ?? d.error),
    cons: `${d.consoleErrors?.length ?? 0}/${m.consoleErrors?.length ?? 0}`,
    failed: `${d.failedRequests?.length ?? 0}/${m.failedRequests?.length ?? 0}`,
    axe: axe ? `${axe.critical}c ${axe.serious}s ${axe.moderate}m ${axe.minor}n` : d.axe?.error ? "err" : "-",
    ovf: [d.metrics?.overflowX ? "desktop" : "", m.metrics?.overflowX ? "mobile" : ""].filter(Boolean).join("+") || "no",
  };
});
rows.sort((a, b) => b.severity - a.severity);

const L = [];
L.push(`# Route sweep: ${results.base}`, "", `Run ${results.startedAt} to ${results.finishedAt}. axe-core: ${results.axe ? "yes" : "no"}. Console/failed columns are desktop/mobile counts.`, "");
const loaded = results.routes.filter((r) => r.views);
L.push(`- Routes: ${results.routes.length} listed, ${loaded.length} loaded, ${loaded.filter((r) => r.redirectedTo).length} redirect-only, ${results.routes.length - loaded.length} not loaded.`);
L.push(`- 5xx: ${loaded.filter((r) => r.views.desktop.status >= 500).length}. Routes with console errors: ${loaded.filter((r) => r.views.desktop.consoleErrors?.length || r.views.mobile.consoleErrors?.length).length}. Routes with failed requests: ${loaded.filter((r) => r.views.desktop.failedRequests?.length || r.views.mobile.failedRequests?.length).length}.`);
const fails = results.matrix.filter((m) => m.verdict === "FAIL" || m.verdict === "ERROR");
L.push(`- Access control: ${results.matrix.length} probes, ${fails.length} FAIL/ERROR.`, "");
if (results.notLoaded.length) L.push("Logins that failed: " + results.notLoaded.map((n) => `${n.role}: ${n.error}`).join("; "), "");

L.push("## Routes, worst first", "", "| Role | Route | Status | Console | Failed req | axe (crit/serious/mod/minor) | Overflow | H | C | D | Tells | Bugs |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const x of rows) {
  const s = x.s;
  L.push(`| ${x.r.role} | ${cell(x.r.url ?? x.r.route)} | ${cell(x.status)} | ${x.cons} | ${x.failed} | ${x.axe} | ${x.ovf} | ${s?.hierarchy ?? "-"} | ${s?.craft ?? "-"} | ${s?.distinct ?? "-"} | ${cell(s?.tells)} | ${cell(s?.bugs)} |`);
}

const withDetail = rows.filter((x) => x.r.views && (x.r.views.desktop.consoleErrors?.length || x.r.views.mobile.consoleErrors?.length || x.r.views.desktop.failedRequests?.length || x.r.views.mobile.failedRequests?.length || x.r.views.desktop.error));
if (withDetail.length) {
  L.push("", "## Console errors and failed requests (detail)", "");
  for (const x of withDetail) {
    const d = x.r.views.desktop;
    const m = x.r.views.mobile;
    L.push(`- **${x.r.role} ${x.r.url}**`);
    for (const e of [...(d.consoleErrors ?? []), ...(m.consoleErrors ?? [])]) L.push(`  - console: ${cell(e)}`);
    for (const e of [...(d.failedRequests ?? []), ...(m.failedRequests ?? [])]) L.push(`  - request: ${cell(e)}`);
    if (d.error) L.push(`  - error: ${cell(d.error)}`);
  }
}

L.push("", "## Access-control matrix", "", "Rows: who is asking. Columns: whose pages. Cell: pass/total (pass = 3xx, 401, 403 or 404, never 200).", "");
const roles = [...new Set(results.matrix.map((m) => m.owner))];
const actors = [...new Set(results.matrix.map((m) => m.actor))];
L.push(`| Actor \\ owner | ${roles.join(" | ")} |`, `|---|${roles.map(() => "---").join("|")}|`);
for (const a of actors) {
  L.push(`| ${a} | ${roles.map((o) => {
    const set = results.matrix.filter((m) => m.actor === a && m.owner === o);
    if (!set.length) return "n/a";
    const pass = set.filter((m) => m.verdict === "pass").length;
    return `${pass}/${set.length}`;
  }).join(" | ")} |`);
}
if (fails.length) {
  L.push("", "### FAIL / ERROR probes", "", "| Actor | Page | Status | Verdict |", "|---|---|---|---|");
  for (const m of fails) L.push(`| ${m.actor} | ${m.path} | ${m.status} | ${m.verdict}: ${cell(m.how)} |`);
} else L.push("", "No probe returned 200 or 5xx.");
const hows = {};
for (const m of results.matrix) hows[`${m.actor}->${m.owner}: ${m.how.replace(/ -> .*/, " -> ...")}`] = (hows[`${m.actor}->${m.owner}: ${m.how.replace(/ -> .*/, " -> ...")}`] ?? 0) + 1;
L.push("", "Response shapes: " + Object.entries(hows).map(([k, v]) => `${k} x${v}`).join("; "));

const redirects = rows.filter((x) => x.r.redirectedTo);
if (redirects.length) {
  L.push("", "## Redirect-only routes (not screenshotted)", "", ...redirects.map((x) => `- ${x.r.role} ${x.r.url} -> ${x.r.redirectedTo}`));
}
const axeRows = rows.filter((x) => x.r.views?.desktop.axe?.rules?.length);
if (axeRows.length) {
  L.push("", "## axe critical/serious rules (desktop, rule(nodes))", "", ...axeRows.map((x) => `- ${x.r.role} ${x.r.url}: ${x.r.views.desktop.axe.rules.join(", ")}`));
}
const unrated = rows.filter((x) => x.r.views && !x.r.redirectedTo && !x.s).length;
L.push("", `Rated for design: ${rows.filter((x) => x.s).length} routes; ${unrated} loaded routes not rated (scores.json has no entry).`);
// hand-written notes (findings, coverage, caveats, skills used) live beside the results
if (existsSync(join(OUT, "notes.md"))) L.push("", readFileSync(join(OUT, "notes.md"), "utf8").trim());

writeFileSync(join(OUT, "REPORT.md"), L.join("\n") + "\n");
console.log(`wrote ${join(OUT, "REPORT.md")}`);
