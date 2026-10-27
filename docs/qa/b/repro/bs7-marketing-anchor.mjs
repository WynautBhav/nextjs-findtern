import { open } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, height: 800, name: "bs7mk-anchor" });
  await s.page.goto(s.url("/terms-and-conditions#s-for-interns-5"), { waitUntil: "networkidle" }); await s.page.waitForTimeout(1200);
  const o = await s.page.evaluate(() => { const e = document.getElementById("s-for-interns-5"); if (!e) return { exists: false }; const r = e.getBoundingClientRect(); const hdr = document.querySelector("header").getBoundingClientRect(); return { exists: true, tag: e.tagName, top: Math.round(r.top), hdrBottom: Math.round(hdr.bottom), text: e.innerText.trim().slice(0, 40), scrollY: Math.round(scrollY) }; });
  console.log(w, JSON.stringify(o));
  await s.page.screenshot({ path: join(SHOTS, `bs7mk-terms-anchor-landing-${w}.png`) });
  await s.close();
}
