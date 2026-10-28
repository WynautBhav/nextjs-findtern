// Tester B, 28 Oct: employer critical path, part 3: book a meeting from the shortlist, check the schedule.
// Usage: PORT=3502 node docs/qa/b/repro/emp2-flow3.mjs [chromium|webkit] [375|1440]
import { open, shot, pick } from "./lib.mjs";
const port = process.env.PORT ?? 3502, engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const s = await open({ port, ...pick("employer"), width, height: width < 500 ? 812 : 900, engine, name: `emp2f3-${engine}-${width}` });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const go = async (p) => { await page.goto(s.url(p), { waitUntil: "networkidle" }); await page.waitForTimeout(300); };

await go("/employer/cart");
const book = page.getByRole("button", { name: /Book meeting/ }).or(page.getByRole("link", { name: /Book meeting/ }));
log("book.count", await book.count());
await book.first().scrollIntoViewIfNeeded();
await book.first().click(); await page.waitForTimeout(1200);
log("after.url", page.url().replace(s.origin, ""));
const dlg = page.getByRole("dialog");
log("dialog.n", await dlg.count());
await shot(s, `emp2f3-${engine}-${width}-book`, { fullPage: false });
const scope = (await dlg.count()) ? dlg : page.locator("main");
const fields = await scope.locator("input:not([type=hidden]), select, textarea").evaluateAll((els) => els.map((e) => ({ type: e.type, name: e.name, ph: e.placeholder, label: e.labels?.[0]?.innerText?.trim().slice(0, 40) ?? e.getAttribute("aria-label"), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), val: e.value?.slice(0, 24) })));
for (const f of fields) log("field", f);
log("text", (await scope.innerText()).replace(/\s+/g, " ").slice(0, 600));
const btns = await scope.locator("button:visible").evaluateAll((els) => els.map((e) => `${e.innerText.trim().slice(0, 30)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}${e.disabled ? " disabled" : ""}`));
log("buttons", btns);
if (process.env.SEND) {
  await dlg.getByRole("button", { name: /Send meeting request/ }).click(); await page.waitForTimeout(1800);
  log("afterSend", { url: page.url().replace(s.origin, ""), dialogs: await page.getByRole("dialog").count(), toast: await page.locator("[data-sonner-toast], [role=status]").allInnerTexts() });
  await shot(s, `emp2f3-${engine}-${width}-booked`, { fullPage: false });
  await go("/employer/schedule");
  log("schedule.text", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 500));
  await shot(s, `emp2f3-${engine}-${width}-schedule-after`);
}
log("errors", [...new Set(s.errors)]);
await s.close();
