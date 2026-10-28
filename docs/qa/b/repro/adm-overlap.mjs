// Tester B, 28 Oct: on each /admin route find (a) controls or labels that overlap each other and (b) content that
// runs past the edge of the box that clips it. Usage: PORT=3502 node adm-overlap.mjs [chromium|webkit] [375|1440]
import { open, pick } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const s = await open({ port: process.env.PORT ?? 3502, ...pick("admin"), width, height: width < 500 ? 812 : 900, engine, name: `admov-${engine}-${width}` });
const { page } = s;
const routes = ["dashboard","interns","users","companies","colleges","projects","proposal-tracker","orders","intern-invoices","transactions","payouts","promo-codes","reports","reports/analytics","reports/money","messages","notification-history","notifications","website","cms","settings","roles","account"].map((x) => `/admin/${x}`);
const first = async (list, re) => { await page.goto(s.url(list), { waitUntil: "networkidle" }); return page.evaluate((src) => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => new RegExp(src).test(h)), re); };
routes.push(await first("/admin/interns", "^/admin/interns/[0-9a-f-]{20,}"), await first("/admin/companies", "^/admin/companies/[0-9a-f-]{20,}"));
for (const r of routes.filter(Boolean)) {
  await page.goto(s.url(r), { waitUntil: "networkidle" }); await page.waitForTimeout(300);
  const res = await page.evaluate(() => {
    const vis = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 1 && b.height > 1 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const label = (e) => (e.innerText || e.getAttribute("aria-label") || e.placeholder || e.value || e.tagName).toString().trim().replace(/\s+/g, " ").slice(0, 26);
    const items = [...document.querySelectorAll("main input:not([type=checkbox]):not([type=radio]):not([type=hidden]), main select, main button, main textarea, main label")].filter(vis).filter((e) => !(e.tagName === "LABEL" && e.querySelector("input,select")));
    const overlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]; if (a.contains(b) || b.contains(a)) continue;
      const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
      const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (w > 4 && h > 4) overlaps.push(`"${label(a)}" x "${label(b)}" ${Math.round(w)}x${Math.round(h)}`);
    }
    const cut = [];
    for (const e of document.querySelectorAll("main *")) {
      if (!vis(e) || e.children.length > 3) continue;
      const t = (e.innerText || "").trim(); if (!t && !/^(INPUT|SELECT|BUTTON)$/.test(e.tagName)) continue;
      const b = e.getBoundingClientRect();
      let p = e.parentElement; while (p && p !== document.body && getComputedStyle(p).overflowX === "visible") p = p.parentElement;
      if (!p || p === document.body) continue;
      const pr = p.getBoundingClientRect(), ps = getComputedStyle(p).overflowX;
      if (/(auto|scroll)/.test(ps)) continue; // a scroller shows its own content
      if (b.right > pr.right + 2) cut.push(`${e.tagName.toLowerCase()} "${label(e)}" ends ${Math.round(b.right - pr.right)}px past its box`);
    }
    return { overlaps: [...new Set(overlaps)].slice(0, 5), cut: [...new Set(cut)].slice(0, 6) };
  });
  if (res.overlaps.length || res.cut.length) console.log(`\n${r}\n  overlap: ${res.overlaps.join(" | ") || "-"}\n  cut: ${res.cut.join(" | ") || "-"}`);
}
await s.close();
