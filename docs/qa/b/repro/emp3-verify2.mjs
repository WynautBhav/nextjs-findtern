// Tester B, 28 Oct: retest part 2 (QA-122 pay target, QA-126/127/128/131/132). Usage: node emp3-verify2.mjs [chromium|webkit]
import { open, shot, pick } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium";
const s = await open({ port: 3502, ...pick("employer"), width: 375, height: 812, engine, name: `emp3v2-${engine}` });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const go = async (p) => { await page.goto(s.url(p), { waitUntil: "networkidle" }); await page.waitForTimeout(300); };
const txt = async () => (await page.locator("main").innerText()).replace(/\s+/g, " ");
// 122: where does Pay go
await go("/employer/orders");
const href = await page.getByRole("link", { name: /Pay ₹/ }).first().getAttribute("href");
await go(href); log("122 pay target", (await txt()).replace(/Skip to content/, "").slice(0, 900));
await shot(s, `emp3v2-${engine}-pay-target`, { fullPage: false });
// 127: is there any feedback on an invalid date
await go("/employer/schedule");
const d = page.getByPlaceholder("DD/MM/YYYY"); await d.fill("1/1/26"); await d.blur(); await page.waitForTimeout(700);
log("127 invalid feedback", await d.evaluate((e) => ({ ariaInvalid: e.getAttribute("aria-invalid"), describedby: e.getAttribute("aria-describedby") && document.getElementById(e.getAttribute("aria-describedby"))?.innerText, validity: e.validationMessage, value: e.value, pattern: e.pattern || null, nextText: e.parentElement?.innerText })));
await shot(s, `emp3v2-${engine}-date-invalid`, { fullPage: false });
// 126/131/128: booking dialog through the row menu
await go("/employer/cart");
const m = page.getByRole("button", { name: /More actions/ }).first(); await m.click(); await page.waitForTimeout(300);
log("menu items (cart)", await page.locator('[role=menuitem]').allInnerTexts());
await page.getByRole("menuitem", { name: /Book a meeting/ }).click().catch(() => log("book via menu", "no such item")); await page.waitForTimeout(900);
const dlg = page.getByRole("dialog");
log("dialogs", await dlg.count());
if (await dlg.count()) {
  log("126 booking inputs", await dlg.locator("input, select").evaluateAll((es) => es.map((e) => `${e.tagName.toLowerCase()}:${e.type}:${e.placeholder || e.getAttribute("aria-label") || "-"}:${e.value}`)));
  log("131 dialog buttons", await dlg.locator("button").evaluateAll((es) => es.map((e) => `${(e.getAttribute("aria-label") || e.innerText).trim().slice(0, 24)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`)));
  await shot(s, `emp3v2-${engine}-booking`, { fullPage: false });
  await dlg.getByRole("button", { name: /Send meeting request/ }).click(); await page.waitForTimeout(1600);
  log("128 toasts", await page.locator("[data-sonner-toast]").allInnerTexts());
  await shot(s, `emp3v2-${engine}-booked`, { fullPage: false });
}
if (process.env.SKIP_APPROVE) { await s.close(); process.exit(0); }
// 132: approve
await go("/employer/timesheets/bc48e71f-9e64-4abf-aa31-c5ccde99d7b2");
log("131/132 decision", await page.locator("main button, main [role=radio]").evaluateAll((es) => es.filter((e) => /Approve|Send back/.test(e.innerText)).map((e) => `${e.innerText.trim().slice(0, 24)} ${Math.round(e.getBoundingClientRect().height)}px`)));
await page.getByRole("button", { name: "Approve timesheet" }).click(); await page.waitForTimeout(900);
log("132 after one tap", { dialogs: await page.getByRole("dialog").count(), text: (await txt()).match(/Decision[^]{0,160}/)?.[0] });
await shot(s, `emp3v2-${engine}-approve`, { fullPage: false });
log("errors", [...new Set(s.errors)].slice(0, 3));
await s.close();
