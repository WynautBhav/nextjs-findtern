// Tester B, 28 Oct: employer critical path, part 2: send a proposal, then book a meeting from the shortlist.
// Usage: PORT=3502 node docs/qa/b/repro/emp2-flow2.mjs [chromium|webkit] [375|1440]
import { open, shot, pick } from "./lib.mjs";
const port = process.env.PORT ?? 3502, engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const s = await open({ port, ...pick("employer"), width, height: width < 500 ? 812 : 900, engine, name: `emp2f2-${engine}-${width}` });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const go = async (p) => { await page.goto(s.url(p), { waitUntil: "networkidle" }); await page.waitForTimeout(300); };
const main = async () => (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 700);

await go("/employer/cart");
const link = page.getByRole("link", { name: /Send proposal/ }).first();
await link.click(); await page.waitForLoadState("networkidle");
await page.locator('input[name="startDate"]').fill("2026-11-20");
await page.locator('textarea[name="message"]').fill("You will own the weekly sales dashboard and work with our analytics lead.");
await shot(s, `emp2f2-${engine}-${width}-form-filled`, { fullPage: false });
await page.getByRole("button", { name: /Review and send/ }).click();
await page.waitForTimeout(1200);
log("afterReview.url", page.url().replace(s.origin, ""));
await shot(s, `emp2f2-${engine}-${width}-review`, { fullPage: false });
log("afterReview.text", await main());
const send = page.getByRole("button", { name: /Agree and send|Send proposal|Send offer|Confirm/ }).first();
log("send.btn", { n: await send.count(), text: await send.innerText().catch(() => null), box: await send.boundingBox().catch(() => null) });
if (await send.count()) {
  const dlg = page.getByRole("dialog");
  log("dialog", { box: await dlg.boundingBox(), cbBox: await dlg.getByRole("checkbox").boundingBox().catch(() => null), cbLabelBox: await dlg.locator("label").last().boundingBox().catch(() => null) });
  await shot(s, `emp2f2-${engine}-${width}-policy-dialog`, { fullPage: false });
  await dlg.getByRole("checkbox").click().catch(async () => dlg.getByText(/I have read and agree/).click());
  await page.waitForTimeout(11000);
  log("send.afterWait", await send.innerText());
  await shot(s, `emp2f2-${engine}-${width}-policy-ready`, { fullPage: false });
  await send.click(); await page.waitForTimeout(1800);
  log("afterSend.url", page.url().replace(s.origin, ""));
  log("afterSend.text", await main());
  await shot(s, `emp2f2-${engine}-${width}-after-send`, { fullPage: false });
}
log("errors", [...new Set(s.errors)]);
await s.close();
