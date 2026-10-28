// Tester B, 28 Oct: row menus (keyboard, Esc, focus), filters that apply on change, DD/MM/YYYY fields.
// Usage: PORT=3502 node docs/qa/b/repro/emp2-interact.mjs [chromium|webkit] [375|1440]
import { open, shot, pick } from "./lib.mjs";

const port = process.env.PORT ?? 3502;
const engine = process.argv[2] ?? "chromium";
const width = Number(process.argv[3] ?? 1440);
const s = await open({ port, ...pick("employer"), width, height: width < 500 ? 812 : 900, engine, name: `emp2i-${engine}-${width}` });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const go = async (p) => { await page.goto(s.url(p), { waitUntil: "networkidle" }); await page.waitForTimeout(300); };
const path = () => new URL(page.url()).pathname + new URL(page.url()).search;

// ---- 1. ⋯ menus on proposals, every row
await go("/employer/proposals");
const triggers = page.locator('button[aria-label^="More actions"]');
const n = await triggers.count();
log("proposals.menus", n);
for (let i = 0; i < n; i++) {
  const t = triggers.nth(i);
  const label = await t.getAttribute("aria-label");
  await t.scrollIntoViewIfNeeded();
  await t.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  const open1 = await page.locator('[role="menu"]').count();
  const items = await page.locator('[role="menuitem"]').allInnerTexts();
  const sizes = await page.locator('[role="menuitem"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  const box = await page.locator('[role="menu"]').first().boundingBox().catch(() => null);
  const inView = box ? box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= (width < 500 ? 812 : 900) : null;
  await page.keyboard.press("ArrowDown");
  const focusedItem = await page.evaluate(() => document.activeElement?.getAttribute("role") + ":" + document.activeElement?.textContent?.trim().slice(0, 20));
  if (i === 0) await shot(s, `emp2i-${engine}-${width}-proposals-menu`, { fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const closed = (await page.locator('[role="menu"]').count()) === 0;
  const back = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  log(`menu[${i}] ${label}`, { opened: open1, items, itemH: [...new Set(sizes)], inViewport: inView, afterArrow: focusedItem, escClosed: closed, focusReturnedTo: back });
}
// Tab key out of an open menu, and outside click
if (n) {
  const t = triggers.first();
  await t.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(200);
  await page.keyboard.press("Tab"); await page.waitForTimeout(200);
  log("menu.tabCloses", (await page.locator('[role="menu"]').count()) === 0);
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  await t.click(); await page.waitForTimeout(200);
  await page.mouse.click(5, 400); await page.waitForTimeout(200);
  log("menu.outsideClickCloses", (await page.locator('[role="menu"]').count()) === 0);
}

const rowsN = () => page.locator('button[aria-label^="More actions"]').count();
// ---- 2. proposals filters apply on change
await go("/employer/proposals");
const sel = page.locator("select").first();
const opts = await sel.locator("option").allInnerTexts();
log("proposals.projectOptions", opts);
if (opts.length > 1) {
  await sel.selectOption({ index: 1 });
  await page.waitForLoadState("networkidle"); await page.waitForTimeout(400);
  log("proposals.afterSelect", { url: path(), rows: await rowsN() });
}
await go("/employer/proposals");
const search = page.getByPlaceholder(/Role, project or initials/i);
await search.fill("Product");
await page.waitForTimeout(1200);
log("proposals.typeNoBlur", { url: path(), rows: await rowsN() });
await search.blur(); await page.waitForTimeout(800);
log("proposals.afterBlur", { url: path(), rows: await rowsN() });
const rows = await page.evaluate(() => document.body.innerText.match(/Product Intern|Data Analyst Intern/g)?.length);
log("proposals.rowsMention", rows);
// tab filter
await go("/employer/proposals");
await page.getByRole("button", { name: /^Hired/ }).first().click(); await page.waitForTimeout(500);
log("proposals.hiredTab", { url: path(), rows: await rowsN() });

// ---- 3. schedule: DD/MM/YYYY
await go("/employer/schedule");
const date = page.getByPlaceholder("DD/MM/YYYY");
for (const v of ["31/10/2026", "99/99/2026", "2026-10-31", "1/1/26", "31/10"]) {
  await go("/employer/schedule");
  await date.fill(v); await date.blur(); await page.waitForTimeout(900);
  const txt = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const msg = (txt.match(/(invalid|valid date|DD\/MM|no interviews|nothing)[^.]{0,80}/i) ?? [""])[0];
  const count = await page.locator("main").evaluate((m) => m.innerText.match(/Booked|Expired|Completed|Waiting on candidate/g)?.length ?? 0);
  log(`schedule.date[${v}]`, { url: path(), msg, statusWordCount: count, errors: [...new Set(s.errors)] });
  s.errors.length = 0;
}
await go("/employer/schedule");
const tz = page.locator("select").last();
const tzOpts = await tz.locator("option").allInnerTexts();
log("schedule.tzOptions", tzOpts);
if (tzOpts.length > 1) { await tz.selectOption({ index: 1 }); await page.waitForLoadState("networkidle"); await page.waitForTimeout(400); log("schedule.afterTz.url", path()); }

// ---- 4. candidates filters
await go("/employer/candidates");
if (width < 500) { await page.getByRole("button", { name: /Filters/i }).first().click().catch(() => page.getByText("Filters").first().click()); await page.waitForTimeout(500); await shot(s, `emp2i-${engine}-${width}-candidates-filters`, { fullPage: false }); }
const selects = await page.locator("select:visible").evaluateAll((els) => els.map((e) => e.getAttribute("name") || e.getAttribute("aria-label") || e.id));
log("candidates.visibleSelects", selects);
const before = path();
const s1 = page.locator("select:visible").first();
if (await s1.count()) {
  const o = await s1.locator("option").allInnerTexts();
  if (o.length > 1) { await s1.selectOption({ index: 1 }); await page.waitForLoadState("networkidle"); await page.waitForTimeout(600); }
}
log("candidates.afterSelect", { before, after: path() });
const buttons = await page.locator("button:visible, a:visible").evaluateAll((els) => els.map((e) => e.innerText.trim()).filter((t) => /^(apply|filter|search|reset|clear)/i.test(t)));
log("candidates.applyButtons", buttons);
await s.close();
