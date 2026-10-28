import { open } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
for (const w of [375, 1440]) {
  const s = await open({ port: 3502, width: w, name: `bs7mk-footer-${w}` });
  for (const r of ["/", "/contact", "/faq"]) {
    await s.page.goto(s.url(r), { waitUntil: "networkidle" });
    await s.page.waitForTimeout(3200);
    await s.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await s.page.waitForTimeout(600);
    const info = await s.page.evaluate(() => {
      const ask = [...document.querySelectorAll("button")].find((b) => /Ask me - chat/.test(b.getAttribute("aria-label") || ""));
      const a = ask.getBoundingClientRect();
      const teaser = [...document.querySelectorAll("button")].find((b) => /Questions about/.test(b.innerText))?.parentElement.getBoundingClientRect();
      const hit = (q) => [...document.querySelectorAll("footer a, footer p, footer span, footer button, footer h2, footer h3, footer li")].filter((e) => { if (e.children.length > 0 && e.tagName !== "A") return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top; }).map((e) => (e.innerText || "").trim().slice(0, 40));
      return { ask: [Math.round(a.x), Math.round(a.y), Math.round(a.width), Math.round(a.height)], askOverlaps: hit(a), teaser: teaser && [Math.round(teaser.x), Math.round(teaser.y), Math.round(teaser.width), Math.round(teaser.height)], teaserOverlaps: teaser ? hit(teaser) : null, scrollY: Math.round(scrollY), vh: innerHeight };
    });
    console.log(w, r, JSON.stringify(info));
    await s.page.screenshot({ path: join(SHOTS, `bs7mk-footer-bottom-${r === "/" ? "home" : r.slice(1)}-${w}.png`), fullPage: false });
  }
  await s.close();
}
