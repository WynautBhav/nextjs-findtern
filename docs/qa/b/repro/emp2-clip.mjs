// Tester B, 28 Oct: content wider than its clipping ancestor (the shell uses overflow:clip, so
// documentElement.scrollWidth stays 375 and the usual crawler check cannot see it).
// Usage: PORT=3502 node docs/qa/b/repro/emp2-clip.mjs [chromium|webkit] [width]
import { open, pick } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const s = await open({ port: process.env.PORT ?? 3502, ...pick("employer"), width, height: 812, engine, name: `emp2clip-${engine}-${width}` });
const { page } = s;
const routes = ["dashboard","candidates","compare","cart","projects","proposals","schedule","send-proposal","timesheets","orders","checkout","alerts","drives","account"].map((x) => `/employer/${x}`);
const first = async (list, re) => { await page.goto(s.url(list), { waitUntil: "networkidle" }); return page.evaluate((src) => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => new RegExp(src).test(h)), re); };
routes.push(await first("/employer/candidates", "^/employer/intern/"), await first("/employer/proposals", "^/employer/proposal/"), await first("/employer/timesheets", "^/employer/timesheets/"), await first("/employer/drives", "^/employer/drives/"));
for (const r of routes.filter(Boolean)) {
  await page.goto(s.url(r), { waitUntil: "networkidle" });
  const out = await page.evaluate(() => {
    const res = [];
    for (const e of document.querySelectorAll("main *")) {
      const b = e.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.right > innerWidth + 1) {
        const t = (e.children.length === 0 ? e.textContent : "").trim().slice(0, 50);
        // report the innermost leaf with text, or the outermost box
        if (t) res.push(`${Math.round(b.right)} "${t}"`);
      }
    }
    return { main: (() => { const m = document.querySelector("main"); return [m.scrollWidth, m.clientWidth]; })(), leaves: res.slice(0, 5) };
  });
  console.log(r.split("?")[0], JSON.stringify(out));
}
await s.close();
