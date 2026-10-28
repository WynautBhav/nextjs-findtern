// Tester B, 28 Oct: employer timesheet review as a phone user (sheet must be `submitted`, real vocabulary).
// Usage: PORT=3502 SHEET=<id> node docs/qa/b/repro/emp2-flow4.mjs [chromium|webkit] [375|1440]
import { open, shot, pick } from "./lib.mjs";
const port = process.env.PORT ?? 3502, engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const sheet = process.env.SHEET ?? "bc48e71f-9e64-4abf-aa31-c5ccde99d7b2";
const s = await open({ port, ...pick("employer"), width, height: width < 500 ? 812 : 900, engine, name: `emp2f4-${engine}-${width}` });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
await page.goto(s.url("/employer/timesheets"), { waitUntil: "networkidle" });
log("list", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 400));
await shot(s, `emp2f4-${engine}-${width}-list`);
await page.goto(s.url(`/employer/timesheets/${sheet}`), { waitUntil: "networkidle" });
log("detail", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 900));
await shot(s, `emp2f4-${engine}-${width}-detail`);
const btns = await page.locator("main button:visible, main a:visible").evaluateAll((els) => els.map((e) => `${e.innerText.trim().slice(0, 28)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
log("actions", btns);
if (process.env.DECIDE) {
  const b = page.getByRole("button", { name: new RegExp(process.env.DECIDE) }).first();
  await b.scrollIntoViewIfNeeded(); await shot(s, `emp2f4-${engine}-${width}-decision`, { fullPage: false });
  await b.click(); await page.waitForTimeout(1200);
  log("afterClick", { dialogs: await page.getByRole("dialog").count(), text: (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-400) });
  await shot(s, `emp2f4-${engine}-${width}-after-decide`, { fullPage: false });
}
log("errors", [...new Set(s.errors)]);
await s.close();
