import { chromium } from "playwright";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 700 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3502/faq", { waitUntil: "networkidle" }); await p.waitForTimeout(500);
console.log(await p.evaluate(() => { const m = [...document.querySelectorAll("header button")].find((x) => /Open menu/.test(x.getAttribute("aria-label") || "")).getBoundingClientRect(); return { innerW: innerWidth, docW: document.documentElement.scrollWidth, menuLeft: Math.round(m.left), menuRight: Math.round(m.right) }; }));
await p.screenshot({ path: join(SHOTS, "bs7mk-header-overflow-faq-375-desktopmode.png"), clip: { x: 0, y: 0, width: 375, height: 120 } });
await b.close();
