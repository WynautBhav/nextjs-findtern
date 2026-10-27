import { open } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, height: 800, name: "bs7mk-nav" });
  await s.page.goto(s.url("/"), { waitUntil: "networkidle" }); await s.page.waitForTimeout(800);
  if (w === 375) { await s.page.locator("button[aria-label='Open menu']").click(); await s.page.waitForTimeout(600); await s.page.screenshot({ path: join(SHOTS, "bs7mk-mobile-menu-375.png") }); }
  const o = await s.page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
    const pick = (root) => [...root.querySelectorAll("a")].filter(vis).filter((a) => /contact|faq/i.test(a.innerText + a.getAttribute("href"))).map((a) => `${a.innerText.trim()}->${a.getAttribute("href")}`);
    return { header: pick(document.querySelector("header")), footer: pick(document.querySelector("footer")) };
  });
  console.log(w, JSON.stringify(o));
  for (const p of ["/contact", "/faq"]) { const r = await s.page.goto(s.url(p)); console.log("  ", p, r.status()); }
  await s.close();
}
