import { open, shot, text } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
import { chromium } from "playwright";
// 1) toggle to USD
const s = await open({ port: 3502, width: 1440, name: "bs7mk-usd" });
await s.page.goto(s.url("/pricing"), { waitUntil: "networkidle" }); await s.page.waitForTimeout(800);
await s.page.locator("button:has-text(\"Prices in\")").first().click(); await s.page.waitForTimeout(300);
await s.page.getByText("US dollar").click(); await s.page.waitForTimeout(800);
let t = await text(s);
console.log("after USD toggle: ₹ count", (t.match(/₹/g) ?? []).length, "$ count", (t.match(/\$/g) ?? []).length, "INR word", (t.match(/\bINR\b/g)??[]).length);
console.log(t.match(/.{30}\$.{40}/g)?.slice(0, 14));
console.log("rupee remnants:", t.match(/.{40}₹.{40}/g));
await s.page.evaluate(() => window.scrollTo(0, 0));
await shot(s, "bs7mk-pricing-usd-1440", { fullPage: true });
// persistence on home
await s.page.goto(s.url("/"), { waitUntil: "networkidle" }); await s.page.waitForTimeout(800);
t = await text(s);
console.log("home after USD: ₹", (t.match(/₹/g) ?? []).length, "$", (t.match(/\$/g) ?? []).length);
console.log("storage:", await s.page.evaluate(() => JSON.stringify({ ls: {...localStorage}, ck: document.cookie })));
await s.close();
// 2) a fresh US-visitor context: US locale + NY timezone
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", timezoneId: "America/New_York", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });
const p = await ctx.newPage();
await p.goto("http://localhost:3502/pricing", { waitUntil: "networkidle" }); await p.waitForTimeout(800);
const tt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
console.log("US-locale default: ₹", (tt.match(/₹/g) ?? []).length, "$", (tt.match(/\$/g) ?? []).length, "pill:", await p.locator("button:has-text(\"Prices in\")").first().innerText());
await b.close();
