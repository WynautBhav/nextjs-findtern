import { open } from "./lib.mjs";
const s = await open({ port: 3502, width: 375, height: 667, name: `bs7mk-footer2` });
for (const r of ["/", "/contact", "/faq", "/pricing", "/about"]) {
  await s.page.goto(s.url(r), { waitUntil: "networkidle" });
  await s.page.waitForTimeout(3000);
  await s.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await s.page.waitForTimeout(500);
  const res = await s.page.evaluate(() => {
    const out = [];
    const foot = document.querySelector("footer");
    for (const e of foot.querySelectorAll("a,button")) {
      const q = e.getBoundingClientRect(); if (!q.width) continue;
      const cx = q.x + q.width / 2, cy = q.y + q.height / 2;
      const top = document.elementFromPoint(cx, cy);
      if (top && !e.contains(top) && !top.contains(e)) out.push({ el: (e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 30), coveredBy: (top.getAttribute("aria-label") || top.innerText || top.tagName).trim().slice(0, 30), y: Math.round(q.y) });
    }
    return out;
  });
  const t1 = await s.page.evaluate(() => !!([...document.querySelectorAll("button")].find((b) => /Questions about/.test(b.innerText))));
  console.log(r, "teaser visible:", t1, JSON.stringify(res));
  await s.page.waitForTimeout(8000);
  console.log("  after 8s more teaser:", await s.page.evaluate(() => !!([...document.querySelectorAll("button")].find((b) => /Questions about/.test(b.innerText)))));
}
await s.close();
