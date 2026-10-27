import { open, shot, text } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, name: `bs7mk-faq-${w}` });
  await s.page.goto(s.url("/faq"), { waitUntil: "networkidle" }); await s.page.waitForTimeout(800);
  const tabs = await s.page.evaluate(() => [...document.querySelectorAll("[role=tab],[role=tablist] button")].map((b) => ({ t: b.innerText.trim(), sel: b.getAttribute("aria-selected"), role: b.getAttribute("role") })));
  console.log(w, "tabs", JSON.stringify(tabs));
  const qs = () => s.page.evaluate(() => [...document.querySelectorAll("button[aria-expanded]")].filter(b=>!/menu|chat|Ask/i.test(b.getAttribute("aria-label")||"")).map((b) => b.innerText.trim().replace(/\s+/g, " ").slice(0, 70)));
  const q1 = await qs(); console.log(" default tab questions:", q1.length, q1.slice(0, 3));
  await s.page.screenshot({ path: join(SHOTS, `bs7mk-faq-default-${w}.png`) });
  const sel0 = await s.page.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((b) => b.getAttribute("aria-selected") === "true")?.innerText);
  const n = await s.page.locator("[role=tab]").count();
  for (let i = 0; i < n; i++) {
    const name = (await s.page.locator("[role=tab]").nth(i).innerText()).split("\n")[0];
    await s.page.locator("[role=tab]").nth(i).click(); await s.page.waitForTimeout(500);
    const q = await qs();
    console.log(" tab", name, "questions:", q.length, q.slice(0, 3), "url", s.page.url().replace(/^http:\/\/localhost:\d+/, ""));
    await s.page.screenshot({ path: join(SHOTS, `bs7mk-faq-tab-${name.toLowerCase().replace(/\W+/g, "-")}-${w}.png`) });
  }
  // deep links
  for (const h of ["#interns", "#employers"]) {
    await s.page.goto(s.url("/faq" + h), { waitUntil: "networkidle" }); await s.page.waitForTimeout(600);
    console.log(" deeplink", h, "selected tab:", await s.page.evaluate(() => [...document.querySelectorAll("[role=tab]")].filter((b) => b.getAttribute("aria-selected") === "true").map((b) => b.innerText.trim())));
  }
  await s.close();
}
