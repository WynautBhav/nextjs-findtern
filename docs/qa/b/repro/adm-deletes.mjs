// Tester B, 28 Oct: the five admin deletes (company, message, CMS item, staff revoke, role): in-page dialog, Cancel sends no DELETE, Esc closes.
// Never confirms. Usage: node adm-deletes.mjs [chromium|webkit] [375|1440]
import { open, shot, pick } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 1440);
const s = await open({ port: 3502, ...pick("admin"), width, height: width < 500 ? 812 : 900, engine, name: `adm-del-${engine}-${width}` });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const native = []; page.on("dialog", async (d) => { native.push(d.message().slice(0, 60)); await d.dismiss(); });
const reqs = []; page.on("request", (r) => !["GET", "HEAD"].includes(r.method()) && !/\/tr\/|google/.test(r.url()) && reqs.push(`${r.method()} ${new URL(r.url()).pathname}`));
const TRIG = /delete|remove|revoke|trash/i;
const dialog = () => page.locator("[role=alertdialog], [role=dialog]").filter({ hasText: /delete|remove|revoke|undone|sure/i });
async function probe(label, path, pick, pre) {
  await page.goto(s.url(path), { waitUntil: "networkidle" }); await page.waitForTimeout(500);
  if (pre) { await pre(page); await page.waitForTimeout(400); }
  const btn = pick(page);
  const n = await btn.count();
  if (!n) { log(label, `no trigger found on ${path}`); return; }
  const name = await btn.first().evaluate((e) => (e.getAttribute("aria-label") || e.innerText || e.title).trim().slice(0, 40));
  await btn.first().scrollIntoViewIfNeeded(); await btn.first().click(); await page.waitForTimeout(600);
  const open1 = await dialog().count();
  const txt = open1 ? (await dialog().first().innerText()).replace(/\s+/g, " ").slice(0, 140) : "";
  await shot(s, `adm-del-${engine}-${width}-${label}`, { fullPage: false });
  const before = reqs.length;
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  const afterEsc = await dialog().count();
  // reopen and cancel
  let cancelled = null;
  if (!afterEsc) { await btn.first().click(); await page.waitForTimeout(500); const c = page.getByRole("button", { name: /^Cancel$|Keep|No, keep|Not now/ }).first(); if (await c.count()) { await c.click(); await page.waitForTimeout(400); cancelled = await dialog().count(); } }
  log(label, { trigger: name, nativeConfirm: native.length, inPageDialog: open1, text: txt, escCloses: open1 ? afterEsc === 0 : null, cancelCloses: cancelled === 0, mutatingRequestsSent: reqs.slice(before).concat(reqs.slice(0, 0)).length });
}
const firstId = async (list, re) => { await page.goto(s.url(list), { waitUntil: "networkidle" }); return page.evaluate((src) => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => new RegExp(src).test(h)), re); };
const comp = await firstId("/admin/companies", "^/admin/companies/[0-9a-f-]{20,}");
await probe("company-detail", comp, (p) => p.getByRole("button", { name: TRIG }));
await probe("message", "/admin/messages", (p) => p.getByRole("button", { name: /^Delete$/ }), (p) => p.locator("main input[type=checkbox]").nth(1).check());
await probe("cms-item", "/admin/website", (p) => p.getByRole("button", { name: TRIG }));
await probe("staff-revoke", "/admin/roles", (p) => p.getByRole("button", { name: /revoke|remove staff|delete staff|Remove access/i }));
await probe("role-delete", "/admin/roles", (p) => p.getByRole("button", { name: /^Delete (Admin|Executive)/ }));
log("all mutating requests during the run", reqs);
log("native confirm dialogs", native);
await s.close();
