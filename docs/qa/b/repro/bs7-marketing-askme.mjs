import { open } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, height: 800, name: "bs7mk-ask" });
  const t0 = Date.now();
  await s.page.goto(s.url("/about"), { waitUntil: "domcontentloaded" });
  await s.page.waitForSelector("button:has-text('Questions about Findtern')", { timeout: 8000 });
  console.log(w, "teaser appeared after ~", Date.now() - t0, "ms");
  const m = await s.page.evaluate(() => { const b = document.querySelector("button[aria-label*='Ask me']"); const r = b.getBoundingClientRect(); const t = [...document.querySelectorAll("button")].find((x) => /Questions about/.test(x.innerText)); const tr = t.getBoundingClientRect(); const cs = getComputedStyle(t); const icon = b.querySelector("svg").getBoundingClientRect(); return { btn: [Math.round(r.width), Math.round(r.height)], icon: Math.round(icon.width), label: b.innerText.trim(), teaserBtnFont: cs.fontSize, teaser: [Math.round(tr.width), Math.round(tr.height)], bottomGap: Math.round(innerHeight - r.bottom), rightGap: Math.round(innerWidth - r.right) }; });
  console.log("  ", JSON.stringify(m));
  await s.page.locator("button[aria-label*='Ask me']").click(); await s.page.waitForTimeout(900);
  const panel = await s.page.evaluate(() => { const p = document.querySelector("[aria-label='Chat with Findtern']"); if (!p) return null; const r = p.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight }; });
  console.log("   panel after click:", JSON.stringify(panel));
  await s.page.screenshot({ path: join(SHOTS, `bs7mk-askme-open-${w}.png`) });
  await s.close();
}
