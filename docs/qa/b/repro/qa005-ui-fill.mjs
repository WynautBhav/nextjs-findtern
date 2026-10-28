// Tester B, 28 Oct: QA-005 through the real grid: Adjust days, set every blank day, save, Approve becomes available.
// Usage: node qa005-ui-fill.mjs  (fresh seed sheet owned by Swiggy, status submitted with 30 blank days)
import { open, shot } from "./lib.mjs";
const s = await open({ port: 3503, role: "employer", email: "careers@swiggy-labs.dev", password: "Findtern@2026", width: 1440, height: 900, name: "qa005-ui-fill" });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
await page.goto(s.url("/employer/timesheets/d92d7934-67d2-4af7-9b54-8e7665c59822"), { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Adjust days/ }).click(); await page.waitForTimeout(600);
const sel = page.locator('main select[aria-label^="Status for"]');
log("day selects", await sel.count());
log("options of the first", await sel.first().locator("option").allInnerTexts());
let filled = 0;
for (let i = 0; i < (await sel.count()); i++) {
  const day = await sel.nth(i).getAttribute("aria-label");
  const weekend = /Saturday|Sunday/.test(day);
  const opts = await sel.nth(i).locator("option").allInnerTexts();
  const want = opts.findIndex((o) => (weekend ? /off/i : /present/i).test(o));
  if ((await sel.nth(i).inputValue()) === "" && want > 0) { await sel.nth(i).selectOption({ index: want }); filled++; }
}
log("filled", filled);
await shot(s, "qa005r-ui-one-tap", { fullPage: false });
log("tiles", (await page.locator("main").innerText()).replace(/\s+/g, " ").match(/Present \d+ Hours \d+ Absent \d+ Off \/ holiday \d+/)?.[0]);
const save = page.getByRole("button", { name: /^Save/ }).first();
log("save", { text: await save.innerText().catch(() => null), disabled: await save.isDisabled().catch(() => null) });
await save.click().catch(() => {}); await page.waitForTimeout(1500);
await page.goto(s.url("/employer/timesheets/d92d7934-67d2-4af7-9b54-8e7665c59822"), { waitUntil: "networkidle" });
const approve = page.getByRole("button", { name: /^Approve timesheet$/ });
log("approve disabled after UI fill", await approve.isDisabled());
log("decision text", (await page.locator("main").innerText()).replace(/\s+/g, " ").match(/Decision[^]{0,200}/)?.[0]);
await shot(s, "qa005r-ui-filled", { fullPage: false });
if (!(await approve.isDisabled())) { await approve.click(); await page.waitForTimeout(600); await page.getByRole("button", { name: /Yes, approve and lock/ }).click(); await page.waitForTimeout(1500); log("after approve", (await page.locator("main").innerText()).replace(/\s+/g, " ").match(/Decision[^]{0,120}/)?.[0]); }
await s.close();
