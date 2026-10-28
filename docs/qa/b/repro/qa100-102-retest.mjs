// Tester B, 28 Oct: retest of QA-100 (header width), QA-101 (employer phone field), QA-102 (Ask me clear of controls) at 375.
// Usage: PORT=3502 node docs/qa/b/repro/qa100-102-retest.mjs [chromium|webkit]
import { open, shot } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium";
const s = await open({ port: process.env.PORT ?? 3502, width: 375, height: 812, engine, name: `qa100-102r-${engine}` });
const { page } = s;
const hit = (a, b) => a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const launcher = () => page.locator('button:has-text("Ask me"), [aria-label*="Ask me" i]').last();

// QA-100: header width, every marketing page that matters
for (const r of engine === "webkit" ? ["/faq", "/pricing", "/about"] : ["/", "/faq", "/pricing", "/about"]) {
  await page.goto(s.url(r), { waitUntil: "load" }); await page.waitForTimeout(500);
  const m = await page.evaluate(() => { const h = document.querySelector("header"); const btns = [...document.querySelectorAll("header button, header a")].filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().right)); return { sw: document.documentElement.scrollWidth, vw: innerWidth, headerRight: Math.max(...btns), headerSw: h?.scrollWidth }; });
  console.log("QA-100", r, JSON.stringify(m), m.sw <= m.vw && m.headerRight <= m.vw ? "OK" : "FAIL");
}
await shot(s, `qa100r-faq-375-${engine}`, { fullPage: false });

// QA-101: employer signup phone row
await page.goto(s.url("/employer/signup"), { waitUntil: "networkidle" });
const phone = await page.evaluate(() => { const i = document.querySelector('input[type=tel], input[name*=phone i]'); const sel = i?.closest("div")?.parentElement?.querySelector("select, button[role=combobox]"); return { phoneW: Math.round(i?.getBoundingClientRect().width ?? 0), phone: i?.placeholder, selW: Math.round(sel?.getBoundingClientRect().width ?? 0), im: i?.inputMode, ac: i?.autocomplete }; });
console.log("QA-101", JSON.stringify(phone), phone.phoneW >= 150 ? "OK" : "FAIL");
await shot(s, `qa101r-employer-signup-375-${engine}`, { fullPage: false });

// QA-102: launcher vs every control, at each scroll step and at the bottom
for (const r of ["/signup", "/employer/signup", "/faq", "/about", "/login"]) {
  await page.goto(s.url(r), { waitUntil: "networkidle" }); await page.waitForTimeout(3500);
  const L = launcher(); const nL = await L.count(); let lb = nL ? await L.boundingBox().catch(() => null) : null;
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const bad = new Set(); let bubble = false;
  for (let y = 0; y <= total; y += 250) {
    await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(120);
    lb = nL ? await L.boundingBox().catch(() => null) : null;
    if (!lb) continue;
    const els = await page.locator('input:visible, a:visible, button:visible, select:visible, textarea:visible').evaluateAll((es) => es.map((e) => { const b = e.getBoundingClientRect(); return { t: (e.innerText || e.placeholder || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30), x: b.x, y: b.y, width: b.width, height: b.height }; }));
    for (const e of els) if (!/Ask me/.test(e.t) && hit(lb, e) && e.width < 360) bad.add(`${e.t} @scroll ${y}`);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300);
  const lbEnd = nL ? await L.boundingBox().catch(() => null) : null;
  const endBad = [];
  if (lbEnd) for (const e of await page.locator('input:visible, a:visible, button:visible').evaluateAll((es) => es.map((e) => { const b = e.getBoundingClientRect(); return { t: (e.innerText || e.placeholder || "").trim().slice(0, 30), x: b.x, y: b.y, width: b.width, height: b.height }; }))) if (!/Ask me/.test(e.t) && hit(lbEnd, e)) endBad.push(e.t);
  console.log("QA-102", r, `launcher=${nL ? "present" : "absent"}`, "coverWhileScrolling:", [...bad].slice(0, 4).join(" | ") || "none", "| atBottom:", endBad.join(" | ") || "clear");
  if (r === "/employer/signup") await shot(s, `qa102r-employer-signup-bottom-375-${engine}`, { fullPage: false });
}
await s.close();
