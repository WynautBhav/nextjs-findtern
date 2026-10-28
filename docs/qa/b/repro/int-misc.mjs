// Tester B, 28 Oct: the hired intern's offer, settings, notifications, profile toggle and college toggles at a phone width.
// Usage: node int-misc.mjs [chromium|webkit] [375|1440]
import { open, shot, pick } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const s = await open({ port: 3502, ...pick("intern"), width, height: width < 500 ? 812 : 900, engine, name: `int-misc-${engine}-${width}` });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const T = async (p) => { await page.goto(s.url(p), { waitUntil: "networkidle" }); await page.waitForTimeout(400); return (await page.locator("main").innerText()).replace(/\s+/g, " "); };
const ctl = (sel = "main") => page.locator(`${sel} a, ${sel} button, ${sel} input, ${sel} select, ${sel} textarea`).evaluateAll((es) => es.filter((e) => { const b = e.getBoundingClientRect(); return b.width > 3 && b.height > 3; }).map((e) => `${e.tagName.toLowerCase()}${e.type && e.tagName === "INPUT" ? ":" + e.type : ""}:${(e.getAttribute("aria-label") || e.name || e.innerText || e.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 26)}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}${e.inputMode ? ":" + e.inputMode : ""}`));
// offer
await page.goto(s.url("/intern/proposals"), { waitUntil: "networkidle" });
const pids = await page.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^\/intern\/proposals\/[0-9a-f-]{20,}/.test(h)))]);
log("proposal links", pids.length);
for (const pid of pids) {
  const t = await T(pid);
  const waiting = /Waiting on you|Accept|Turn it down/.test(t);
  log(`offer ${pid.slice(-6)} status`, t.match(/(Waiting on you|Hired|Rejected|Expired)/)?.[0]);
  if (waiting) {
    log("offer controls", (await ctl()).filter((c) => /button|a:/.test(c)).slice(0, 12));
    await shot(s, `int-misc-${engine}-${width}-offer`);
    const acc = page.getByRole("button", { name: /^(Accept|Accept offer|Accept and)/ }).first();
    if (await acc.count()) { await acc.click(); await page.waitForTimeout(800); const d = page.getByRole("dialog"); log("accept dialog", (await d.innerText().catch(() => "(none)")).replace(/\s+/g, " ").slice(0, 520)); log("accept dialog controls", await d.locator("button, input").evaluateAll((es) => es.map((e) => `${e.tagName.toLowerCase()}:${e.type || ""}:${(e.getAttribute("aria-label") || e.innerText || "").trim().slice(0, 28)}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}${e.disabled ? ":disabled" : ""}`))); await shot(s, `int-misc-${engine}-${width}-accept-dialog`, { fullPage: false }); await page.keyboard.press("Escape"); await page.waitForTimeout(300); log("esc closes dialog", (await page.getByRole("dialog").count()) === 0); }
    const dec = page.getByRole("button", { name: /Turn it down|Decline/ }).first();
    if (await dec.count()) { await dec.click(); await page.waitForTimeout(700); log("decline dialog", (await page.getByRole("dialog").innerText().catch(() => "(none)")).replace(/\s+/g, " ").slice(0, 300)); await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
  }
}
// settings and bank
await T("/intern/settings");
log("settings controls", (await ctl()).filter((c) => /input|select|textarea|button/.test(c)).slice(0, 24));
await shot(s, `int-misc-${engine}-${width}-settings`);
// notifications
const n = await T("/intern/notifications");
log("notifications head", n.slice(0, 160));
await page.getByRole("button", { name: /Mark all as read/ }).click().catch(() => {}); await page.waitForTimeout(800);
log("after mark all", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 120));
// profile: Open to work toggle
await T("/intern/profile");
const otw = page.getByRole("button", { name: /Open to work/ }).first();
log("open-to-work", { n: await otw.count(), box: await otw.boundingBox().catch(() => null), role: await otw.getAttribute("role").catch(() => null), pressed: await otw.getAttribute("aria-pressed").catch(() => null), checked: await otw.getAttribute("aria-checked").catch(() => null) });
// college toggles accessible names
await T("/intern/college");
log("college toggles", await page.locator("main input[type=checkbox], main [role=switch], main button[role=checkbox]").evaluateAll((es) => es.map((e) => `${e.tagName.toLowerCase()}:${e.getAttribute("aria-label") || e.labels?.[0]?.innerText?.slice(0, 30) || "(no name)"}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`)));
log("errors", [...new Set(s.errors)].filter((e) => !/avatar|googletag|CONNECTION_RESET|404/.test(e)).slice(0, 3));
await s.close();
