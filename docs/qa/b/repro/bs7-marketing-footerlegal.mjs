import { open } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
for (const w of [1440, 1024, 768, 375]) {
  const s = await open({ port: 3502, width: w, name: `bs7mk-fl-${w}` });
  await s.page.goto(s.url("/"), { waitUntil: "networkidle" }); await s.page.waitForTimeout(400);
  const o = await s.page.evaluate(() => {
    const cols = [...document.querySelectorAll("footer h2,footer h3,footer h4,footer p")].filter((h) => /legal/i.test(h.innerText.trim()) && h.innerText.trim().length < 12);
    const h = cols[0]; const col = h.parentElement;
    const links = [...col.querySelectorAll("a")].map((a) => { const r = a.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(a).lineHeight); return { t: a.innerText.trim(), y: Math.round(r.y + scrollY), h: Math.round(r.height), lines: Math.round(r.height / (lh || 20)), href: a.getAttribute("href") }; });
    const pitch = links.slice(1).map((l, i) => l.y - links[i].y);
    return { links, pitch };
  });
  console.log(w, JSON.stringify(o.pitch), o.links.map((l) => `${l.t}(${l.h}px,${l.href})`).join(" | "));
  await s.close();
}
