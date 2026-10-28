// Tester B, 28 Oct: totals per browser x width from the per-cell crawl results (see /tmp driver: one `npm run qa -- crawl` per cell).
// Usage: node matrix-aggregate.mjs <dir with <browser>-<width>/results.json>  -> prints the markdown table.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2];
const cols = ["pages", "error screens", "console errors", "failed requests", "overflow", "axe serious/critical", "other"];
const cls = (k) => ({ "error-boundary": 1, "blank-page": 1, "error-screen": 1 })[k] ? "error screens" : /^(console-error|page-error)$/.test(k) ? "console errors" : /^(http-status|request-failed)$/.test(k) ? "failed requests" : /overflow/.test(k) ? "overflow" : /axe/.test(k) ? "axe serious/critical" : "other";
const rows = [];
for (const name of readdirSync(dir).filter((n) => /^[a-z]+-\d+$/.test(n)).sort((a, b) => a.split("-")[0].localeCompare(b.split("-")[0]) || Number(a.split("-")[1]) - Number(b.split("-")[1]))) {
  const f = join(dir, name, "results.json"); if (!existsSync(f)) { rows.push([name, "(not run)"]); continue; }
  const r = JSON.parse(readFileSync(f, "utf8"));
  const c = Object.fromEntries(cols.map((k) => [k, 0])); c.pages = r.pagesChecked;
  const kinds = {};
  for (const x of r.findings) { c[cls(x.kind)]++; kinds[x.kind] = (kinds[x.kind] ?? 0) + 1; }
  rows.push([name, ...cols.map((k) => c[k]), Object.entries(kinds).map(([k, v]) => `${k}:${v}`).join(" ")]);
}
console.log(["browser x width", ...cols, "kinds"].join(" | "));
for (const r of rows) console.log(r.join(" | "));
