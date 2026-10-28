// Tester B, 28 Oct: the redesigned /admin screens, judged against DESIGN.md §0. Usage: PORT=3502 node adm-sweep.mjs [chromium|webkit] [375|1440]
import { open, shot, pick } from "./lib.mjs";
const port = process.env.PORT ?? 3502, engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const s = await open({ port, ...pick("admin"), width, height: width < 500 ? 812 : 900, engine, name: `adm-${engine}-${width}` });
const { page } = s;
const BANNED = /\b(unlock|elevate|seamless|supercharge|welcome back|nothing here yet|leverage|empower)\b|👋|✨|🚀/i;
async function audit(slug) {
  const r = await page.evaluate(() => {
    const out = { clip: null, docOverflow: null, small: [], tiny: [], ellipsis: [], scrollers: [], tables: 0, icons: [] };
    const m = document.querySelector("main"); if (m && m.scrollWidth > m.clientWidth + 1) out.clip = [m.scrollWidth, m.clientWidth];
    if (document.documentElement.scrollWidth > innerWidth + 1) out.docOverflow = document.documentElement.scrollWidth;
    const vis = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    for (const e of document.querySelectorAll("main a[href], main button, main input:not([type=hidden]), main select, main textarea, header a, header button")) {
      if (!vis(e)) continue; const b = e.getBoundingClientRect();
      if ((b.height < 40 && b.width < 400) || b.height < 32) out.small.push(`${e.tagName.toLowerCase()} "${(e.innerText || e.getAttribute("aria-label") || e.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 26)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    for (const e of document.querySelectorAll("main *")) {
      if (e.children.length === 0 && e.textContent.trim() && vis(e)) {
        const cs = getComputedStyle(e), fs = parseFloat(cs.fontSize);
        if (fs < 12 && !/^[A-Z0-9 ·\-–/&]+$/.test(e.textContent.trim())) out.tiny.push(`${fs}px "${e.textContent.trim().slice(0, 30)}"`);
        if (/ellipsis/.test(cs.textOverflow) && e.scrollWidth > e.clientWidth + 1) out.ellipsis.push(e.textContent.trim().slice(0, 48));
      }
      const cs = getComputedStyle(e);
      if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 2 && vis(e)) out.scrollers.push(`${e.tagName.toLowerCase()}.${(e.className || "").toString().split(" ")[0].slice(0, 20)} ${e.scrollWidth}>${e.clientWidth}`);
    }
    out.tables = document.querySelectorAll("main table").length;
    for (const h of document.querySelectorAll("main h2, main h3")) if (h.querySelector("svg")) out.icons.push(h.textContent.trim().slice(0, 30));
    return out;
  });
  const body = await page.locator("main").innerText().catch(() => "");
  const banned = [...new Set(body.match(new RegExp(BANNED.source, "gi")) ?? [])];
  const u = (a) => [...new Set(a)].slice(0, 8);
  console.log(`\n## ${slug} @${engine}/${width}`);
  console.log(` clip(main): ${r.clip ? r.clip.join(" > ") : "none"} | docOverflow: ${r.docOverflow ?? "none"} | tables: ${r.tables}`);
  if (r.scrollers.length) console.log(` h-scrollers: ${u(r.scrollers).join(" | ")}`);
  if (r.small.length) console.log(` small targets (${r.small.length}): ${u(r.small).join(" | ")}`);
  if (r.tiny.length) console.log(` <12px: ${u(r.tiny).join(" | ")}`);
  if (r.ellipsis.length) console.log(` ellipsis: ${u(r.ellipsis).join(" | ")}`);
  if (r.icons.length) console.log(` icon-in-heading: ${u(r.icons).join(" | ")}`);
  if (banned.length) console.log(` banned copy: ${banned.join(" ")}`);
  if (s.errors.length) { console.log(` errors: ${u(s.errors).join(" | ")}`); s.errors.length = 0; }
}
const routes = ["dashboard","interns","users","companies","colleges","projects","proposal-tracker","orders","intern-invoices","transactions","payouts","promo-codes","reports","reports/analytics","reports/money","messages","notification-history","notifications","website","cms","cms/terms","interns/terms","interns/non-disclosure","companies/terms","settings","roles","account"].map((x) => `/admin/${x}`);
const first = async (list, re) => { await page.goto(s.url(list), { waitUntil: "networkidle" }); return page.evaluate((src) => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => new RegExp(src).test(h)), re); };
const det = [await first("/admin/interns", "^/admin/interns/[0-9a-f-]{20,}"), await first("/admin/companies", "^/admin/companies/[0-9a-f-]{20,}")].filter(Boolean);
for (const r of [...routes, ...det]) {
  await page.goto(s.url(r), { waitUntil: "networkidle" }); await page.waitForTimeout(350);
  const slug = r.replace(/^\/admin\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/[0-9a-f-]{20,}/, "id");
  await shot(s, `adm-${engine}-${width}-${slug}`);
  await audit(r);
}
await s.close();
