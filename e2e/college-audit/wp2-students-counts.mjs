// WP2 C1: every Students-page tile, hidden-reason chip, year tab and stage chip opens a list of exactly that size. Needs the wp2 build on :3332 and Chromium (ctx.mjs helper).
// Usage (cwd = worktree): node e2e/college-audit/wp2-students-counts.mjs
import { openRoles, closeAll } from "./lib/ctx.mjs";
import { assertLocalOnly } from "./lib/local-only.mjs";
const base = process.env.WP2_BASE ?? "http://localhost:3332";
assertLocalOnly(base);
const { browser, ctxs } = await openRoles(["tpo"], { base });
const p = await ctxs.tpo.newPage();
let bad = 0, ok = 0;
const check = (label, a, b) => { if (a === b) ok++; else { bad++; console.log("MISMATCH", label, a, b); } };
const showing = async () => { const t = await p.locator("section[aria-label=Students] footer").innerText(); const m = t.match(/Showing\s+(\d+)\s+of\s+(\d+)/); return +m[2]; };
// dashboard numbers
await p.goto(base + "/college", { waitUntil: "load" }); await p.waitForTimeout(800);
const dash = await p.$$eval("main a", (as) => as.map((a) => [a.getAttribute("href"), a.innerText.replace(/\s+/g, " ")]));
const hiddenLinks = dash.filter(([h]) => h && h.startsWith("/college/students?show=hidden"));
const funnel = dash.filter(([h]) => h && /^\/college\/students(\?show=(not_joined|interviewed|offered|hired))?$/.test(h));
console.log(JSON.stringify(funnel.slice(0, 8)), JSON.stringify(hiddenLinks));
for (const [h, text] of [...hiddenLinks, ...funnel]) {
  const num = +(text.match(/(\d[\d,]*)\s*(?:·|$|\s[a-z])/i)?.[1] ?? NaN);
  const m = text.match(/(\d+)/); const n = m ? +m[1] : null;
  await p.goto(base + h, { waitUntil: "load" }); await p.waitForTimeout(500);
  const got = await showing();
  console.log(h, "| tile", n, "| list", got, got === n ? "" : "  <-- check");
}
// students page: each chip count vs list; each year segment vs list
await p.goto(base + "/college/students", { waitUntil: "load" }); await p.waitForTimeout(500);
check("verified tab", +(await p.locator("button[aria-pressed]", { hasText: "Verified students" }).first().innerText()).match(/\d+/)[0], await showing());
const chips = await p.$$eval("[aria-label='Show only'] button", (bs) => bs.map((b) => b.innerText.replace(/\s+/g, " ")));
console.log("chips", chips);
for (const c of chips) {
  const name = c.replace(/\s*\d+$/, ""); const n = +c.match(/(\d+)$/)[1];
  await p.locator("[aria-label='Show only'] button", { hasText: name }).first().click();
  check("chip " + name, n, await showing());
  await p.locator("[aria-label='Show only'] button[aria-pressed=true]").first().click();
}
console.log("years", await p.locator("[role=group][aria-label=Year] button:visible").allInnerTexts());
for (const y of ["1st", "2nd", "3rd", "4th"]) {
  const b = p.locator("[role=group][aria-label=Year] button:visible", { hasText: y }).first();
  const n = +(await b.innerText()).match(/(\d+)\s*$/)[1];
  await b.click(); check("year " + y, n, await showing());
  await p.locator("[role=group][aria-label=Year] button:visible", { hasText: "All" }).first().click();
}
console.log({ ok, bad });
await closeAll(browser);
process.exit(bad ? 1 : 0);
