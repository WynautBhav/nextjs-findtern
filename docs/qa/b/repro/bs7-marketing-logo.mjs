import { chromium } from "playwright";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
const b = await chromium.launch();
for (const w of [1440, 375]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3502/", { waitUntil: "networkidle" }); await p.waitForTimeout(600);
  const m = async (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), nw: e.naturalWidth, nh: e.naturalHeight, complete: e.complete, cs: e.currentSrc.split("/").pop(), alt: e.alt }; }, sel);
  console.log(w, "header@top", JSON.stringify(await m("header img")));
  await p.screenshot({ path: join(SHOTS, `bs7mk-logo-header-${w}-2x.png`), clip: { x: 0, y: 0, width: Math.min(w, 700), height: 90 } });
  await p.evaluate(() => window.scrollTo(0, 700)); await p.waitForTimeout(500);
  console.log(w, "header@scrolled", JSON.stringify(await m("header img")));
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(700);
  console.log(w, "footer", JSON.stringify(await m("footer img")));
  const cap = await p.evaluate(() => [...document.querySelectorAll("header a[href='/']")].map((a) => ({ imgs: a.querySelectorAll("img").length, svgs: a.querySelectorAll("svg").length, text: a.innerText.trim() })));
  console.log("  header logo links:", JSON.stringify(cap));
  await ctx.close();
}
await b.close();
