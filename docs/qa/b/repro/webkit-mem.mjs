// Tester B, 28 Oct: does a WebKit page balloon in memory? Samples the WPE web process RSS every second; aborts above 3 GB.
// Usage: PORT=3502 node webkit-mem.mjs <path> [width]
import { webkit } from "playwright";
import { execSync } from "node:child_process";
const path = process.argv[2] ?? "/", width = Number(process.argv[3] ?? 360), port = process.env.PORT ?? 3502;
const rss = () => Number(execSync("ps -eo rss,args | grep WPEWebProcess | grep -v grep | awk '{s+=$1} END {print s+0}'").toString().trim()) / 1024;
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width, height: 800 }, extraHTTPHeaders: { "x-forwarded-for": "10.9.9.9" } });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(String(e.message).slice(0, 80))); p.on("crash", () => errs.push("CRASH"));
p.goto(`http://localhost:${port}${path}`, { waitUntil: "commit", timeout: 20000 }).catch((e) => errs.push("goto: " + e.message.slice(0, 60)));
let peak = 0;
for (let i = 0; i < 14; i++) { await new Promise((r) => setTimeout(r, 1000)); const m = rss(); peak = Math.max(peak, m); process.stdout.write(`${i + 1}s:${Math.round(m)}MB `); if (m > 3000) { console.log("\nABORT: above 3 GB"); break; } }
console.log(`\npeak ${Math.round(peak)} MB; events: ${JSON.stringify(errs)}`);
await b.close().catch(() => {});
