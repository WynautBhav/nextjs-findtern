import { open, shot, text } from "./lib.mjs";
import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", timezoneId: "America/New_York" });
await ctx.addInitScript(() => { try { localStorage.setItem("ft-currency", "USD"); } catch {} });
const p = await ctx.newPage();
for (const r of ["/", "/interns", "/guaranteed-internship-program", "/faq", "/about", "/pricing"]) {
  await p.goto("http://localhost:3502" + r, { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
  const tt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  console.log(r, "₹", (tt.match(/₹|\bINR\b|\bRs\.?\s?\d/g) ?? []).length, (tt.match(/.{50}(₹|\bINR\b).{40}/g) ?? []).slice(0, 4), "$", (tt.match(/\$/g) ?? []).length);
}
await b.close();
