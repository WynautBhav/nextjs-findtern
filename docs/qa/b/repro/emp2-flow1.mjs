// Tester B, 28 Oct: employer critical path as a phone user. Part 1: shortlist, then open the proposal form.
// Usage: PORT=3502 node docs/qa/b/repro/emp2-flow1.mjs [chromium|webkit] [375|1440]
import { open, shot, pick } from "./lib.mjs";
const port = process.env.PORT ?? 3502, engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const s = await open({ port, ...pick("employer"), width, height: width < 500 ? 812 : 900, engine, name: `emp2f1-${engine}-${width}` });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const go = async (p) => { await page.goto(s.url(p), { waitUntil: "networkidle" }); await page.waitForTimeout(300); };
const badge = () => page.locator('a[href="/employer/cart"], a[aria-label*="hortlist"]').first().innerText().catch(() => "?");

await go("/employer/candidates");
log("header.cartBadge.before", await badge());
const btn = page.getByRole("button", { name: /^\+?\s*Shortlist$/ }).first();
log("shortlist.btn", { text: await btn.innerText(), box: await btn.boundingBox() });
await btn.click(); await page.waitForTimeout(900);
log("header.cartBadge.after", await badge());
log("firstRowActionAfter", await page.getByRole("button", { name: /Shortlisted/ }).count());
await shot(s, `emp2f1-${engine}-${width}-after-shortlist`, { fullPage: false });

await go("/employer/cart");
log("cart.tabs", (await page.locator("main").innerText()).split("\n").slice(0, 12).join(" | "));
const sp = page.getByRole("link", { name: /Send proposal/ }).first();
log("cart.sendProposal.href", await sp.getAttribute("href"));
await sp.click(); await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
log("form.url", page.url().replace(s.origin, ""));
await shot(s, `emp2f1-${engine}-${width}-proposal-form`);
const fields = await page.locator("main input:not([type=hidden]), main select, main textarea").evaluateAll((els) => els.map((e) => ({ tag: e.tagName.toLowerCase(), type: e.type, name: e.name, im: e.inputMode, ac: e.autocomplete, ph: e.placeholder, label: e.labels?.[0]?.innerText?.trim().slice(0, 40) ?? e.getAttribute("aria-label"), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), val: e.value?.slice(0, 20) })));
for (const f of fields) log("field", f);
log("errors", [...new Set(s.errors)]);
await s.close();
