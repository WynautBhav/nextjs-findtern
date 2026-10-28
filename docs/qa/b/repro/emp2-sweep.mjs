// Tester B, 28 Oct (second pass): the redesigned employer screens, judged against DESIGN.md §0.
// Usage: PORT=3502 node docs/qa/b/repro/emp2-sweep.mjs [chromium|webkit] [375|1440]
// Writes docs/qa/b/screens/emp2-<engine>-<width>-<slug>.png and prints automatic findings.
import { open, shot, pick } from "./lib.mjs";

const port = process.env.PORT ?? 3502;
const engine = process.argv[2] ?? "chromium";
const width = Number(process.argv[3] ?? 375);
const s = await open({ port, ...pick("employer"), width, height: width < 500 ? 812 : 900, engine, name: `emp2-${engine}-${width}` });
const { page } = s;

const BANNED = /\b(unlock|elevate|seamless|supercharge|welcome back|nothing here yet|leverage|empower)\b|!|👋|✨|🚀/i;

async function audit(slug) {
  const r = await page.evaluate((w) => {
    const out = { overflow: null, small: [], tiny: [], clipped: [], heads: [] };
    const de = document.documentElement;
    if (de.scrollWidth > innerWidth + 1) out.overflow = de.scrollWidth;
    const vis = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0"; };
    for (const e of document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,[role=tab],[role=menuitem],[role=checkbox],[role=switch]")) {
      if (!vis(e)) continue;
      const b = e.getBoundingClientRect();
      // stretched title links cover the whole row; judge by the larger of the element and its row
      if (b.height < 40 && b.width < 400 || b.height < 36) out.small.push(`${e.tagName.toLowerCase()} "${(e.innerText || e.getAttribute("aria-label") || e.getAttribute("placeholder") || "").trim().slice(0, 30)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    for (const e of document.querySelectorAll("p,span,td,th,li,label,a,button,h1,h2,h3,h4,dd,dt,div")) {
      if (e.children.length > 0 && e.tagName === "DIV") continue;
      const t = (e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) ? e.textContent.trim() : "";
      if (!t || !vis(e)) continue;
      const cs = getComputedStyle(e);
      const fs = parseFloat(cs.fontSize);
      if (fs < 12 && !/^[A-Z0-9 ·\-–/]+$/.test(t)) out.tiny.push(`${fs}px "${t.slice(0, 40)}"`);
      if (e.scrollWidth > e.clientWidth + 2 && cs.overflowX !== "visible" && cs.textOverflow !== "ellipsis") out.clipped.push(`"${t.slice(0, 50)}" sw${e.scrollWidth}>cw${e.clientWidth}`);
      if (cs.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1) out.clipped.push(`ellipsis "${t.slice(0, 50)}"`);
      const b = e.getBoundingClientRect();
      if (b.right > innerWidth + 1 || b.left < -1) out.clipped.push(`offscreen "${t.slice(0, 40)}" ${Math.round(b.left)}..${Math.round(b.right)}`);
    }
    for (const h of document.querySelectorAll("h1,h2,h3")) if (h.querySelector("svg") && vis(h)) out.heads.push(h.textContent.trim().slice(0, 40));
    return out;
  }, width);
  const body = await page.evaluate(() => document.body.innerText);
  const banned = [...new Set((body.match(new RegExp(BANNED.source, "gi")) ?? []))];
  const uniq = (a) => [...new Set(a)].slice(0, 12);
  console.log(`\n## ${slug} @${engine}/${width}`);
  console.log(` overflow: ${r.overflow ?? "none"}`);
  if (r.small.length) console.log(` small targets (${r.small.length}): ${uniq(r.small).join(" | ")}`);
  if (r.tiny.length) console.log(` <12px text (${r.tiny.length}): ${uniq(r.tiny).join(" | ")}`);
  if (r.clipped.length) console.log(` clipped: ${uniq(r.clipped).join(" | ")}`);
  if (r.heads.length) console.log(` icon-in-heading: ${uniq(r.heads).join(" | ")}`);
  if (banned.length) console.log(` banned copy: ${banned.join(" ")}`);
  if (s.errors.length) { console.log(` errors: ${[...new Set(s.errors)].join(" | ")}`); s.errors.length = 0; }
}

async function visit(path, slug) {
  await page.goto(s.url(path), { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await shot(s, `emp2-${engine}-${width}-${slug}`);
  await audit(slug);
}

const first = async (listPath, re) => {
  await page.goto(s.url(listPath), { waitUntil: "networkidle" });
  return page.evaluate((src) => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => new RegExp(src).test(h)) ?? null, re.source);
};

const routes = [
  ["/employer/dashboard", "dashboard"],
  ["/employer/candidates", "candidates"],
  ["/employer/compare", "compare"],
  ["/employer/cart", "cart"],
  ["/employer/projects", "projects"],
  ["/employer/proposals", "proposals"],
  ["/employer/schedule", "schedule"],
  ["/employer/send-proposal", "send-proposal"],
  ["/employer/timesheets", "timesheets"],
  ["/employer/orders", "orders"],
  ["/employer/checkout", "checkout"],
  ["/employer/alerts", "alerts"],
  ["/employer/drives", "drives"],
  ["/employer/account", "account"],
];
for (const [p, slug] of routes) await visit(p, slug);

const det = {
  intern: await first("/employer/candidates", /^\/employer\/intern\/[\w-]+/),
  proposal: await first("/employer/proposals", /^\/employer\/proposal\/[\w-]+/),
  sheet: await first("/employer/timesheets", /^\/employer\/timesheets\/[\w-]+/),
  drive: await first("/employer/drives", /^\/employer\/drives\/[\w-]+/),
};
console.log("\ndetail links:", JSON.stringify(det));
for (const [k, h] of Object.entries(det)) if (h) await visit(h, `detail-${k}`);
await s.close();
