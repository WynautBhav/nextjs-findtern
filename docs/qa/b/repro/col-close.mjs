// Tester B, 28 Oct: "Close link now" on a college drive: in-page confirm, Cancel sends nothing, Esc closes, Confirm revokes.
// Usage: DRIVE=<id> node col-close.mjs [chromium|webkit] [375|1440]
import { open, shot } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375), DRIVE = process.env.DRIVE;
const s = await open({ port: 3502, role: "college", email: "tpo@jklu.edu.in", password: "Findtern@2026", width, height: width < 500 ? 812 : 900, engine, name: `col-close-${engine}-${width}` });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const dlgs = []; page.on("dialog", async (d) => { dlgs.push(`${d.type()}: ${d.message().slice(0, 80)}`); await d.dismiss(); });
const reqs = []; page.on("request", (r) => r.method() !== "GET" && reqs.push(`${r.method()} ${new URL(r.url()).pathname}`));
await page.goto(s.url(`/college/drives/${DRIVE}`), { waitUntil: "networkidle" });
const state = async () => (await page.locator("main").innerText()).replace(/\s+/g, " ");
log("before", (await state()).slice(0, 200));
const close = page.getByRole("button", { name: /Close link now/ });
log("close btn", { n: await close.count(), box: await close.boundingBox() });
const base = await page.locator("[role=dialog], [role=alertdialog]").count();
log("dialogs before click", base);
await close.click(); await page.waitForTimeout(600);
const confirmText = (await state()).match(/(Close|Are you sure|stops|can't be undone|revoke)[^]{0,200}/i)?.[0];
log("after click", { nativeDialogs: dlgs, inPageDialogs: await page.locator("[role=dialog], [role=alertdialog]").count(), confirmText, requests: reqs });
await shot(s, `col-close-${engine}-${width}-confirm`, { fullPage: false });
// Esc
await page.keyboard.press("Escape"); await page.waitForTimeout(400);
log("esc closes confirm", { dialogsNow: await page.locator("[role=dialog], [role=alertdialog]").count(), baseline: base, confirmStillVisible: await page.getByRole("button", { name: /^Cancel$/ }).count(), requests: reqs });
// reopen, Cancel
if (!(await page.getByRole("button", { name: /^Cancel$|Keep link/ }).count())) await close.click().catch(() => {});
await page.waitForTimeout(400);
const cancel = page.getByRole("button", { name: /^Cancel$|Keep (the )?link|No, keep/ }).first();
log("cancel btn", await cancel.count());
if (await cancel.count()) { await cancel.click(); await page.waitForTimeout(500); log("after cancel", { requests: reqs, still: (await state()).includes("Close link now") }); }
if (process.env.CONFIRM) {
  await close.click().catch(() => {}); await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Yes, close|Close the link|Yes/ }).first().click(); await page.waitForTimeout(1800);
  log("after confirm", { requests: reqs, page: (await state()).slice(0, 300) });
  await shot(s, `col-close-${engine}-${width}-revoked`);
}
log("errors", [...new Set(s.errors)].filter((e) => !/avatar|googletag|CONNECTION_RESET|TLS/.test(e)).slice(0, 3));
await s.close();
