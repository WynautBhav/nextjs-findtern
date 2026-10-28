// Tester B, 28 Oct: text-level confirmation on the current build of the employer-pass findings.
import { open, shot, pick } from "./lib.mjs";
const s = await open({ port: 3502, ...pick("employer"), width: 375, height: 812, name: "emp2-verify" });
const { page } = s;
const T = async (p, sel = "main") => { await page.goto(s.url(p), { waitUntil: "networkidle" }); return (await page.locator(sel).innerText()).replace(/\s+/g, " "); };
let t = await T("/employer/schedule?q=&date=99%2F99%2F2026&project=&tz=");
console.log("schedule 99/99/2026 →", t.slice(t.indexOf("Timezone"), t.indexOf("Timezone") + 260));
t = await T("/employer/orders");
console.log("orders lede →", t.slice(t.indexOf("Orders & payments"), t.indexOf("Orders & payments") + 200));
t = await T("/employer/checkout");
console.log("checkout unlock →", t.match(/[^.]*unlock[^.]*\./i)?.[0]);
console.log("checkout due →", t.match(/Due [^ ]+ [^ ]+ [^ ]+/)?.[0]);
t = await T("/employer/timesheets");
console.log("timesheets rows →", await page.locator("main a").evaluateAll((es) => es.filter((e) => /RV|Ritika/.test(e.innerText)).map((e) => e.innerText.replace(/\s+/g, " ").slice(0, 120))));
const trunc = await page.evaluate(() => [...document.querySelectorAll("main p, main span, main div")].filter((e) => e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow === "ellipsis").map((e) => e.textContent.trim()));
console.log("timesheets ellipsised →", trunc);
await shot(s, "emp2v-timesheets-375", { fullPage: false });
for (const p of ["/employer/candidates", "/employer/projects", "/employer/proposals", "/employer/orders"]) {
  await page.goto(s.url(p), { waitUntil: "networkidle" });
  const tr = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && /ellipsis/.test(getComputedStyle(e).textOverflow)).map((e) => e.textContent.trim().slice(0, 60)));
  console.log(p, "ellipsised →", [...new Set(tr)].slice(0, 6));
}
await page.goto(s.url("/employer/candidates"), { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/claude-1000/cand-now.png", clip: { x: 0, y: 840, width: 375, height: 380 } });
await s.close();
