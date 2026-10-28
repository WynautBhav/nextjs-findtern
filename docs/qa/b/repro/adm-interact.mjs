// Tester B, 28 Oct: admin behaviours: filters on change, DD/MM dates, destructive row actions, inline edits, payouts.
// Usage: PORT=3502 node adm-interact.mjs [chromium|webkit] [375|1440]
import { open, shot, pick } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 1440);
const s = await open({ port: process.env.PORT ?? 3502, ...pick("admin"), width, height: width < 500 ? 812 : 900, engine, name: `admi-${engine}-${width}` });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const go = async (p) => { await page.goto(s.url(p), { waitUntil: "networkidle" }); await page.waitForTimeout(300); };
const path = () => new URL(page.url()).pathname + new URL(page.url()).search;
const count = (sel) => page.locator(sel).count();

// 1. candidate list: filters apply on change?
await go("/admin/interns");
const shown0 = (await page.locator("main").innerText()).match(/Showing[^]{0,40}candidates/)?.[0];
const sel = page.locator("main select").first();
log("interns.firstSelect.options", await sel.locator("option").allInnerTexts());
await sel.selectOption({ index: 1 }); await page.waitForLoadState("networkidle"); await page.waitForTimeout(600);
log("interns.afterSelect", { url: path(), before: shown0, after: (await page.locator("main").innerText()).match(/Showing[^]{0,40}candidates/)?.[0] });
await go("/admin/interns");
const q = page.getByPlaceholder(/Search name/i); await q.fill("Qab"); await page.waitForTimeout(1200);
log("interns.typeNoEnter", path()); await q.press("Enter"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(500); log("interns.afterEnter", path());
log("interns.applyButtons", await page.locator("main button, main a").evaluateAll((es) => es.map((e) => e.innerText.trim()).filter((t) => /^(Apply|Filter|Search|Go)\b/i.test(t))));
// 2. DD/MM date fields
for (const p of ["/admin/orders", "/admin/proposal-tracker", "/admin/reports"]) {
  await go(p);
  const d = page.getByPlaceholder("DD/MM/YYYY").first();
  const n = await d.count(); if (!n) { log(`${p} date`, "no DD/MM field"); continue; }
  await d.fill("31/10/2026"); await d.blur(); await page.waitForTimeout(900);
  const afterGood = path();
  await go(p); await page.getByPlaceholder("DD/MM/YYYY").first().fill("2026-10-31"); await page.getByPlaceholder("DD/MM/YYYY").first().blur(); await page.waitForTimeout(900);
  log(`${p} date`, { good: afterGood, isoTyped: path(), types: await page.locator("main input[placeholder='DD/MM/YYYY']").evaluateAll((es) => es.map((e) => e.type)) });
}
// 3. destructive actions on a test candidate
await go("/admin/interns?q=Qab");
log("row actions text", await page.locator("main").evaluate((m) => [...m.querySelectorAll("button, a")].map((e) => e.innerText.trim()).filter((t) => /^(Hide|Show|Live|Deactivate|Activate|Active)$/.test(t)).slice(0, 8)));
const deact = page.getByRole("button", { name: /^Deactivate$/ }).first();
if (await deact.count()) {
  await deact.click(); await page.waitForTimeout(700);
  log("deactivate.click", { dialogs: await page.getByRole("dialog").count(), alertdialogs: await page.getByRole("alertdialog").count(), text: ((await page.getByRole("dialog").or(page.getByRole("alertdialog")).first().innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 220) });
  await shot(s, `admi-${engine}-${width}-deactivate`, { fullPage: false });
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  log("deactivate.escCloses", (await page.getByRole("dialog").count()) === 0);
}
log("errors", [...new Set(s.errors)].slice(0, 3));
await s.close();
