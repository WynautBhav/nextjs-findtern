// Tester B, 28 Oct: the hired intern's timesheet flow at a phone width: new sheet dialog, then the sheet.
// Usage: node int-ts.mjs [chromium|webkit] [375|1440]
import { open, shot, pick } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const s = await open({ port: 3502, ...pick("intern"), width, height: width < 500 ? 812 : 900, engine, name: `int-ts-${engine}-${width}` });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
await page.goto(s.url("/intern/timesheets"), { waitUntil: "networkidle" });
log("controls", await page.locator("main a, main button").evaluateAll((es) => es.map((e) => `${(e.getAttribute("aria-label") || e.innerText).trim().replace(/\s+/g, " ").slice(0, 34)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`).filter((t) => !/^ \d/.test(t)).slice(0, 14)));
log("next timesheet card", (await page.locator("main").innerText()).replace(/\s+/g, " ").match(/Next timesheet[^]{0,140}/)?.[0]);
await page.getByRole("button", { name: /New timesheet/ }).click(); await page.waitForTimeout(700);
const dlg = page.getByRole("dialog");
log("dialog", (await dlg.innerText().catch(() => "(none)")).replace(/\s+/g, " ").slice(0, 420));
log("dialog fields", await dlg.locator("input, select, textarea, button").evaluateAll((es) => es.map((e) => `${e.tagName.toLowerCase()}:${e.type || ""}:${(e.getAttribute("aria-label") || e.name || e.innerText || e.placeholder || "").trim().slice(0, 24)}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`)));
await shot(s, `int-ts-${engine}-${width}-new`, { fullPage: false });
await page.keyboard.press("Escape"); await page.waitForTimeout(300);
// open the latest sheet
const sheet = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => /timesheets\/[0-9a-f-]{20,}|timesheets\?/.test(h || "")));
log("sheet link", sheet);
if (sheet) { await page.goto(s.url(sheet), { waitUntil: "networkidle" }); log("sheet url", page.url().replace(s.origin, "")); log("sheet text", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 380)); await shot(s, `int-ts-${engine}-${width}-sheet`); }
log("errors", [...new Set(s.errors)].filter((e) => !/avatar|googletag|CONNECTION_RESET/.test(e)).slice(0, 3));
await s.close();
