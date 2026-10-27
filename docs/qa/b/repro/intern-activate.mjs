import { open, shot, text, pickOr as pick } from "./lib.mjs";
const W = Number(process.argv[2] ?? 375);
const s = await open({ port: 3502, ...pick("intern"), width: W, name: `intern-activate-${W}` });
const p = s.page;
await p.goto(s.url("/intern/dashboard"), { waitUntil: "networkidle" });
const body = () => p.evaluate(() => document.querySelector("main")?.innerText.replace(/\s+/g, " ") ?? "");
console.log("before:", (await body()).slice(0, 500));
await p.getByRole("button", { name: /activate free/i }).click();
await p.waitForTimeout(3500);
await p.goto(s.url("/intern/dashboard"), { waitUntil: "networkidle" });
console.log("after:", (await body()).slice(0, 700));
await shot(s, `intern-activated-dashboard-${W}`, { fullPage: false });
for (const r of ["/intern/interviews", "/intern/proposals", "/intern/opportunities", "/intern/timesheets", "/intern/earnings"]) {
  await p.goto(s.url(r), { waitUntil: "networkidle" });
  console.log(r, "→", new URL(p.url()).pathname, "|", (await body()).slice(0, 220));
}
console.log(s.errors);
await s.close();
