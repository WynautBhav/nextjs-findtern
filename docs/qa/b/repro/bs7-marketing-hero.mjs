import { open } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, height: w === 375 ? 800 : 900, name: "bs7mk-hero" });
  await s.page.goto(s.url("/"), { waitUntil: "networkidle" }); await s.page.waitForTimeout(1200);
  const h1 = () => s.page.evaluate(() => document.querySelector("h1").innerText.replace(/\s+/g, " "));
  console.log(w, "default h1:", await h1());
  const tabs = await s.page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => /I'm a student|I'm hiring/.test(b.innerText)).map((b) => `${b.innerText.trim()}|role=${b.getAttribute("role")}|pressed=${b.getAttribute("aria-pressed")}|sel=${b.getAttribute("aria-selected")}`));
  console.log("  switch:", JSON.stringify(tabs));
  await s.page.screenshot({ path: join(SHOTS, `bs7mk-hero-hiring-${w}.png`) });
  await s.page.locator("button:has-text(\"I'm a student\")").first().click(); await s.page.waitForTimeout(1200);
  console.log("  after student click h1:", await h1());
  console.log("  hero CTAs:", await s.page.evaluate(() => [...document.querySelector("h1").closest("section").querySelectorAll("a")].map((a) => `${a.innerText.trim()}->${a.getAttribute("href")}`)));
  await s.page.screenshot({ path: join(SHOTS, `bs7mk-hero-student-${w}.png`) });
  await s.close();
}
