// Tester B, 28 Oct: retest of QA-120..136 on the fixed build. Usage: PORT=3502 node docs/qa/b/repro/emp3-verify.mjs [chromium|webkit]
import { open, shot, pick } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium";
const s = await open({ port: 3502, ...pick("employer"), width: 375, height: 812, engine, name: `emp3v-${engine}` });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const go = async (p) => { await page.goto(s.url(p), { waitUntil: "networkidle" }); await page.waitForTimeout(300); };
const txt = async (sel = "main") => (await page.locator(sel).innerText()).replace(/\s+/g, " ");

// 120 / 121: per-row actions
await go("/employer/proposals");
log("120 proposals row buttons+links", await page.evaluate(() => [...document.querySelectorAll("main li, main [role=row], main article, main > div > div > div")].filter((r) => /Intern/.test(r.innerText) && r.querySelectorAll("button, a").length && r.getBoundingClientRect().height < 260).slice(0, 8).map((r) => [...r.querySelectorAll("button, a")].map((b) => (b.getAttribute("aria-label") || b.innerText).trim().replace(/\s+/g, " ").slice(0, 34)).filter(Boolean).join(" / "))));
const menus = await page.locator('button[aria-label^="More actions"]').evaluateAll((es) => es.map((e) => e.getAttribute("aria-label")));
log("120 menu labels", { n: menus.length, unique: new Set(menus).size, sample: menus.slice(0, 3) });
await go("/employer/schedule");
log("121 schedule card actions", await page.evaluate(() => [...document.querySelectorAll("main button, main a")].filter((e) => /Join meeting|Send reminder|Reschedule|Offer new times|Leave feedback|Profile|More actions/.test(e.innerText + (e.getAttribute("aria-label") || ""))).map((e) => (e.innerText.trim() || e.getAttribute("aria-label")).slice(0, 28))));
// 122 / 123
await go("/employer/orders");
const pay = page.getByRole("link", { name: /Pay ₹|Pay/ }).or(page.getByRole("button", { name: /Pay ₹/ })).first();
log("122 pay control", { n: await pay.count(), text: await pay.innerText().catch(() => null), href: await pay.getAttribute("href").catch(() => null) });
log("123 lede", (await txt()).match(/hires?[^]{0,110}/)?.[0]);
await go("/employer/checkout"); log("123 checkout", (await txt()).match(/Ready to pay[^]{0,230}/)?.[0] ?? (await txt()).slice(0, 200));
await go("/employer/proposals"); log("123 proposals tabs", (await txt()).match(/All \d+[^]{0,100}/)?.[0]);
// 124 cart
await go("/employer/cart");
log("124 cart", { badge: await page.locator('a[href="/employer/cart"]').first().innerText().catch(() => "?"), head: (await txt()).match(/\d+ shortlisted/)?.[0], tabs: (await txt()).match(/Shortlist \d+[^]{0,60}Hired \d+/)?.[0], sendBtns: await page.getByRole("link", { name: /Send proposal/ }).count() });
// 125 candidates
await go("/employer/candidates");
log("125 candidates", await page.evaluate(() => ({ searchBoxes: [...document.querySelectorAll("main input")].filter((i) => ["text", "search", ""].includes(i.type) && i.getBoundingClientRect().width > 0).map((i) => i.placeholder), applyReset: [...document.querySelectorAll("button, a")].map((e) => e.innerText.trim()).filter((t) => /^(Apply|Reset)$/.test(t)), firstCardTop: Math.round((document.querySelector("main li, main [data-candidate], main article")?.getBoundingClientRect().top ?? -1) + scrollY), vh: innerHeight })));
await shot(s, `emp3v-${engine}-candidates-top`, { fullPage: false });
// 136 launcher over search
const L = page.locator('button:has-text("Ask me")').last();
const lb = await L.boundingBox().catch(() => null);
const sb = await page.locator("main input").first().boundingBox();
log("136 launcher", { launcher: lb && [Math.round(lb.x), Math.round(lb.y), Math.round(lb.width), Math.round(lb.height)], firstInput: sb && [Math.round(sb.x), Math.round(sb.y), Math.round(sb.width)], overlapsFirstInput: !!(lb && sb && lb.x < sb.x + sb.width && lb.x + lb.width > sb.x && lb.y < sb.y + sb.height && lb.y + lb.height > sb.y) });
// 126 forms
const cart = await (async () => { await go("/employer/cart"); return page.getByRole("link", { name: /Send proposal/ }).first().getAttribute("href"); })();
await go(cart);
log("126 form fields", await page.locator("main input:not([type=hidden])").evaluateAll((es) => es.filter((e) => ["startDate", "monthlyHours", "monthlyAmount"].includes(e.name)).map((e) => `${e.name}:${e.type}:inputmode=${e.inputMode || "-"}:ph=${e.placeholder || "-"}`)));
// 127 schedule date filter
for (const v of ["31/10/2026", "2026-10-31", "1/1/26", "99/99/2026"]) {
  await go("/employer/schedule"); const d = page.getByPlaceholder("DD/MM/YYYY"); await d.fill(v); await d.blur(); await page.waitForTimeout(900);
  const t = await txt(); log(`127 date[${v}]`, { url: new URL(page.url()).search.slice(0, 40), msg: (t.match(/(not a (valid )?date|Use DD\/MM\/YYYY|Enter a date|invalid)[^.]{0,60}/i) ?? [t.match(/Showing \d+ of \d+[^.]{0,40}/)?.[0] ?? ""])[0] });
}
// 135 titles
for (const p of ["/login", "/employer/login"]) { const r = await fetch(s.origin + p); log(`135 title ${p}`, (await r.text()).match(/<title>[^<]*<\/title>/)?.[0]); }
// 130 ellipsis
for (const p of ["/employer/timesheets", "/employer/projects", "/employer/proposals", "/employer/orders", "/employer/candidates"]) { await go(p); const tr = await page.evaluate(() => [...new Set([...document.querySelectorAll("main *")].filter((e) => e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && /ellipsis/.test(getComputedStyle(e).textOverflow)).map((e) => e.textContent.trim().slice(0, 50)))]); log(`130 ellipsis ${p}`, tr); }
// 131 tab strips, dialog close, segmented
await go("/employer/proposals");
log("131 tab strip", await page.evaluate(() => { const t = [...document.querySelectorAll("main button, main a")].find((e) => /^All\b/.test(e.innerText.trim())); const p = t?.parentElement; return p && { scrollW: p.scrollWidth, clientW: p.clientWidth, wraps: getComputedStyle(p).flexWrap, overflowX: getComputedStyle(p).overflowX }; }));
await go("/employer/cart"); await page.getByRole("button", { name: /Book meeting/ }).or(page.getByRole("link", { name: /Book meeting/ })).first().click().catch(() => {}); await page.waitForTimeout(800);
const dlg = page.getByRole("dialog");
if (await dlg.count()) {
  log("131 dialog close", await dlg.locator('button[aria-label*="lose"], button:has-text("Close")').evaluateAll((es) => es.map((e) => `${e.getAttribute("aria-label") || e.innerText} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`)));
  log("126 booking date inputs", await dlg.locator("input").evaluateAll((es) => es.map((e) => `${e.type}:${e.placeholder || "-"}`)));
  if (process.env.SEND) { await dlg.getByRole("button", { name: /Send meeting request/ }).click(); await page.waitForTimeout(1800); log("128 toasts", await page.locator("[data-sonner-toast], [role=status], [role=dialog]").allInnerTexts()); await go("/employer/schedule"); log("128 schedule head", (await txt()).slice(0, 140)); }
}
// 129 copy
await go("/employer/checkout"); log("129 checkout unlock", /unlock/i.test(await txt()));
await go("/employer/send-proposal"); log("129 empty send-proposal", (await txt()).slice(0, 260));
// 132 approve confirm
await page.goto(s.url("/employer/timesheets/bc48e71f-9e64-4abf-aa31-c5ccde99d7b2"), { waitUntil: "networkidle" });
log("131 decision controls", await page.locator("main [role=radio], main button").evaluateAll((es) => es.filter((e) => /^(Approve|Send back)$/.test(e.innerText.trim())).map((e) => `${e.innerText.trim()} ${Math.round(e.getBoundingClientRect().height)}px`)));
log("errors", [...new Set(s.errors)].slice(0, 3));
await s.close();
