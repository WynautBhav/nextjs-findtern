// Tester B, 28 Oct: measure two cut-off lines at 375, and the native date field under an Indian locale.
import { chromium, webkit } from "playwright";
import { pick } from "./lib.mjs";
const p = pick("employer"), origin = "http://localhost:3502";
for (const [name, eng] of [["chromium", chromium], ["webkit", webkit]]) {
  const b = await eng.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, locale: "en-IN", extraHTTPHeaders: { "x-forwarded-for": `10.9.${(Math.random()*250)|0}.${(Math.random()*250)|0}`, "x-forwarded-proto": "http" } });
  await ctx.request.post(origin + "/api/auth/employer/login", { data: { email: p.email, password: p.password }, headers: { origin } });
  const page = await ctx.newPage();
  await page.goto(origin + "/employer/drives", { waitUntil: "networkidle" });
  console.log(name, "drives", await page.evaluate(() => { const a = [...document.querySelectorAll("main a, main li, main article, main div")].find((e) => /Summer internship drive/.test(e.textContent) && e.getBoundingClientRect().width > 300); const m = document.querySelector("main"); const r = a?.getBoundingClientRect(); return { vw: innerWidth, de: document.documentElement.scrollWidth, main: m && [m.scrollWidth, m.clientWidth, getComputedStyle(m).overflowX], row: r && [Math.round(r.left), Math.round(r.right)], bodyOverflowX: getComputedStyle(document.body).overflowX, htmlOverflowX: getComputedStyle(document.documentElement).overflowX }; }));
  await page.goto(origin + "/employer/candidates", { waitUntil: "networkidle" });
  const href = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => /^\/employer\/intern\//.test(h)));
  await page.goto(origin + href, { waitUntil: "networkidle" });
  console.log(name, "price", await page.evaluate(() => { const e = [...document.querySelectorAll("p,span,div")].find((x) => x.children.length === 0 && /per hire/.test(x.textContent)); const r = e.getBoundingClientRect(); let o = e, hid = null; while (o && o !== document.body) { const cs = getComputedStyle(o); if (cs.overflowX !== "visible") { hid = [o.tagName, cs.overflowX, Math.round(o.getBoundingClientRect().right)]; break; } o = o.parentElement; } return { text: e.textContent.trim(), left: Math.round(r.left), right: Math.round(r.right), sw: e.scrollWidth, cw: e.clientWidth, clippedBy: hid }; }));
  await page.goto(origin + "/employer/send-proposal?" + (await (async () => { await page.goto(origin + "/employer/cart", { waitUntil: "networkidle" }); return (await page.getByRole("link", { name: /Send proposal/ }).first().getAttribute("href")).split("?")[1]; })()), { waitUntil: "networkidle" });
  console.log(name, "date.locale", await page.evaluate(() => ({ lang: navigator.language, input: (() => { const i = document.querySelector('input[name=startDate]'); i.value = "2026-11-20"; return i.value; })() })));
  await page.locator('input[name="startDate"]').fill("2026-11-20");
  await page.screenshot({ path: `/tmp/claude-1000/date-${name}.png`, clip: { x: 0, y: 0, width: 375, height: 10 } });
  await b.close();
}
