// Open the live employer screens (next dev :3500, hot reload) in the owner's visible Chrome (:9333), logged in as an employer.
import { chromium } from "playwright";
const B = "http://localhost:3500";
const b = await chromium.connectOverCDP("http://127.0.0.1:9333");
const ctx = b.contexts()[0];
const first = ctx.pages()[0] || await ctx.newPage();
await first.goto(`${B}/employer/login`, { timeout: 120000 });
console.log("login", await first.evaluate(async (pw) => (await fetch("/api/auth/employer/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "qa.employer.heavy@qa.test", password: pw }) })).status, process.env.PW));
const urls = ["/employer/candidates", "/employer/dashboard", "/employer/proposals", "/employer/projects"];
await first.goto(B + urls[0], { timeout: 180000, waitUntil: "domcontentloaded" });
for (const u of urls.slice(1)) { const p = await ctx.newPage(); await p.goto(B + u, { timeout: 180000, waitUntil: "domcontentloaded" }).catch(e => console.log(u, String(e).slice(0, 80))); }
const cand = ctx.pages().find(p => p.url().includes("/candidates"));
const prof = await cand.$("a[href*='/employer/intern/']");
if (prof) { const p = await ctx.newPage(); await p.goto(B + await prof.getAttribute("href"), { timeout: 180000, waitUntil: "domcontentloaded" }); }
await cand.bringToFront();
console.log(ctx.pages().map(p => p.url()).join("\n"));
await b.close();
