import { open } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
const s = await open({ port: 3502, width: 375, height: 700, name: "bs7mk-hdr375" });
for (const r of ["/", "/about", "/pricing", "/contact", "/faq", "/interns", "/guaranteed-internship-program", "/terms-and-conditions", "/intern-terms-and-conditions", "/intern-nda"]) {
  await s.page.goto(s.url(r), { waitUntil: "networkidle" }); await s.page.waitForTimeout(500);
  const o = await s.page.evaluate(() => {
    const h = document.querySelector("header"); const hr = h.getBoundingClientRect();
    const items = [...h.querySelectorAll("a,button,img")].map((e) => { const q = e.getBoundingClientRect(); return q.width ? `${(e.getAttribute("aria-label") || e.getAttribute("alt") || e.innerText || e.tagName).trim().slice(0, 16)}@${Math.round(q.left)}-${Math.round(q.right)}` : null; }).filter(Boolean);
    return { hdr: [Math.round(hr.left), Math.round(hr.right), Math.round(hr.height)], items, docW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth, wide: [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > 376 && getComputedStyle(e).position !== "fixed").slice(0, 3).map((e) => e.tagName + "." + String(e.className).slice(0, 40) + ":" + Math.round(e.getBoundingClientRect().right)) };
  });
  console.log(r, JSON.stringify(o));
}
await s.close();
