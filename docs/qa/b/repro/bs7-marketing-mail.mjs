import { open } from "./lib.mjs";
const routes = ["/", "/about", "/pricing", "/contact", "/faq", "/interns", "/guaranteed-internship-program", "/intern-nda", "/intern-terms-and-conditions", "/terms-and-conditions", "/privacy", "/opportunities", "/blog", "/employers", "/employer-terms-and-conditions"];
const s = await open({ port: 3502, width: 1440, name: "bs7mk-mail" });
for (const r of routes) {
  const res = await s.page.goto(s.url(r), { waitUntil: "networkidle" }); await s.page.waitForTimeout(500);
  // expand every collapsed accordion
  for (const sel of ["button[aria-expanded=false]"]) {
    const bs = await s.page.$$(sel);
    for (const b of bs) { try { const t = (await b.getAttribute("aria-label")) || ""; if (/menu|chat|ask/i.test(t)) continue; await b.click({ timeout: 500 }); } catch {} }
  }
  await s.page.waitForTimeout(300);
  const out = await s.page.evaluate(() => {
    const rx = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}/g;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const bad = [], good = []; let n;
    while ((n = w.nextNode())) {
      if (n.parentElement.closest("script,style,noscript")) continue;
      const m = n.textContent.match(rx); if (!m) continue;
      for (const e of m) { const a = n.parentElement.closest("a[href^='mailto:']"); (a ? good : bad).push(e + (a ? " -> " + a.getAttribute("href") : "")); }
    }
    return { bad, good: [...new Set(good)] };
  });
  console.log(r, res.status(), "NOT LINKED:", JSON.stringify(out.bad), "| linked:", JSON.stringify(out.good));
}
await s.close();
