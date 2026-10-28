// Tester B, 28 Oct: the redesigned /intern screens, judged against DESIGN.md §0.
// Usage: PORT=3502 PERSONA=hired|empty|one node int-sweep.mjs [chromium|webkit] [375|1440]
import { open, shot } from "./lib.mjs";
const PERSONAS = { hired: ["ritika.launchtest@gmail.com", "Launch#2026pw"], empty: ["qa.intern.empty@qa.test", "Qa#Situations2026"], one: ["qa.intern.one@qa.test", "Qa#Situations2026"] };
const persona = process.env.PERSONA ?? "hired", [email, password] = PERSONAS[persona];
const port = process.env.PORT ?? 3502, engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const s = await open({ port, role: "intern", email, password, width, height: width < 500 ? 812 : 900, engine, name: `int-${persona}-${engine}-${width}` });
const { page } = s;
const BANNED = /\b(unlock|elevate|seamless|supercharge|welcome back|nothing here yet|leverage|empower|hurray|congratulations)\b|👋|✨|🚀|🎉/i;
async function audit(slug) {
  const r = await page.evaluate(() => {
    const out = { clip: null, doc: null, small: [], tiny: [], ellipsis: [], scrollers: [], overlaps: [], cut: [], icons: [] };
    const m = document.querySelector("main"); if (m && m.scrollWidth > m.clientWidth + 1) out.clip = [m.scrollWidth, m.clientWidth];
    if (document.documentElement.scrollWidth > innerWidth + 1) out.doc = document.documentElement.scrollWidth;
    const vis = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 1 && b.height > 1 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const label = (e) => (e.innerText || e.getAttribute("aria-label") || e.placeholder || e.value || e.tagName).toString().trim().replace(/\s+/g, " ").slice(0, 28);
    for (const e of document.querySelectorAll("main a[href], main button, main input:not([type=hidden]), main select, main textarea")) {
      if (!vis(e)) continue; const b = e.getBoundingClientRect();
      if ((b.height < 40 && b.width < 400) || b.height < 32) out.small.push(`${e.tagName.toLowerCase()} "${label(e)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    for (const e of document.querySelectorAll("main *")) {
      if (e.children.length === 0 && e.textContent.trim() && vis(e)) {
        const cs = getComputedStyle(e), fs = parseFloat(cs.fontSize);
        if (fs < 12 && !/^[A-Z0-9 ·\-–/&]+$/.test(e.textContent.trim())) out.tiny.push(`${fs}px "${e.textContent.trim().slice(0, 28)}"`);
        if (/ellipsis/.test(cs.textOverflow) && e.scrollWidth > e.clientWidth + 1) out.ellipsis.push(e.textContent.trim().slice(0, 44));
      }
      const cs = getComputedStyle(e);
      if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 2 && vis(e)) out.scrollers.push(`${e.tagName.toLowerCase()} ${e.scrollWidth}>${e.clientWidth}`);
    }
    const items = [...document.querySelectorAll("main input:not([type=checkbox]):not([type=radio]):not([type=hidden]), main select, main button, main textarea")].filter(vis);
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]; if (a.contains(b) || b.contains(a)) continue;
      const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
      const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (w > 4 && h > 4) out.overlaps.push(`"${label(a)}" x "${label(b)}" ${Math.round(w)}x${Math.round(h)}`);
    }
    for (const e of document.querySelectorAll("main *")) {
      if (!vis(e) || e.children.length > 3) continue;
      if (!(e.innerText || "").trim() && !/^(INPUT|SELECT|BUTTON)$/.test(e.tagName)) continue;
      let p = e.parentElement; while (p && p !== document.body && getComputedStyle(p).overflowX === "visible") p = p.parentElement;
      if (!p || p === document.body || /(auto|scroll)/.test(getComputedStyle(p).overflowX)) continue;
      if (e.getBoundingClientRect().right > p.getBoundingClientRect().right + 2) out.cut.push(`${e.tagName.toLowerCase()} "${label(e)}" ${Math.round(e.getBoundingClientRect().right - p.getBoundingClientRect().right)}px past`);
    }
    for (const h of document.querySelectorAll("main h2, main h3")) if (h.querySelector("svg")) out.icons.push(h.textContent.trim().slice(0, 28));
    return out;
  });
  const body = await page.locator("main").innerText().catch(() => "");
  const banned = [...new Set(body.match(new RegExp(BANNED.source, "gi")) ?? [])];
  const u = (a) => [...new Set(a)].slice(0, 7);
  console.log(`\n## ${slug} @${persona}/${engine}/${width} (${new URL(page.url()).pathname})`);
  console.log(` clip(main): ${r.clip ? r.clip.join(" > ") : "none"} | doc: ${r.doc ?? "none"}`);
  for (const [k, v] of [["h-scrollers", r.scrollers], ["small targets", r.small], ["<12px", r.tiny], ["ellipsis", r.ellipsis], ["overlap", r.overlaps], ["cut", r.cut], ["icon-in-heading", r.icons]]) if (v.length) console.log(` ${k} (${v.length}): ${u(v).join(" | ")}`);
  if (banned.length) console.log(` banned copy: ${banned.join(" ")}`);
  if (s.errors.length) { console.log(` errors: ${u(s.errors).join(" | ")}`); s.errors.length = 0; }
}
const routes = ["dashboard","timesheets","earnings","interviews","record","opportunities","proposals","documents","profile","college","notifications","settings","bank-details","onboarding"].map((x) => `/intern/${x}`);
const first = async (list, re) => { await page.goto(s.url(list), { waitUntil: "networkidle" }); return page.evaluate((src) => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => new RegExp(src).test(h)), re); };
const det = [await first("/intern/opportunities", "^/intern/opportunities/[0-9a-f-]{20,}"), await first("/intern/proposals", "^/intern/proposals/[0-9a-f-]{20,}")].filter(Boolean);
for (const r of [...routes, ...det]) {
  await page.goto(s.url(r), { waitUntil: "networkidle" }).catch(() => {}); await page.waitForTimeout(400);
  const slug = r.replace(/^\/intern\//, "").replace(/[0-9a-f-]{20,}/, "id").replace(/[^a-z0-9]+/gi, "-");
  await shot(s, `int-${persona}-${engine}-${width}-${slug}`);
  await audit(r);
}
await s.close();
