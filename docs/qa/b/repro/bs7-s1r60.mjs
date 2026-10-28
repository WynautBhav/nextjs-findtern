// Tester B, 28 Oct: S1 r60 "I can update my preferred location in remote work which could not be done".
// A complete intern reopens the wizard from "Edit profile", walks to the location step, changes the cities, saves.
import { open, shot, pick } from "./lib.mjs";
const s = await open({ port: 3502, ...pick("intern"), width: 1440, name: "s1r60" });
const { page } = s;
await page.goto(s.url("/intern/profile"), { waitUntil: "networkidle" });
const before = (await page.locator("main").innerText()).replace(/\s+/g, " ").match(/Preferred cities [^A-Z]*[A-Za-z, ]{0,40}/)?.[0];
console.log("profile before:", before);
await page.getByRole("link", { name: /Edit profile/ }).first().click(); await page.waitForLoadState("networkidle");
for (let i = 0; i < 10; i++) {
  const step = (await page.locator("main").innerText()).replace(/\s+/g, " ").match(/Step \d of \d[^A-Z]{0,3}[A-Za-z &/-]{0,30}/)?.[0];
  const t = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  console.log(i, step, "| mentions preferred cities:", /preferred (cit|location)/i.test(t));
  if (/preferred (cit|location)/i.test(t)) break;
  const next = page.getByRole("button", { name: /^(Continue|Next|Save and continue)/ }).first();
  if (!(await next.count())) break;
  await next.click(); await page.waitForTimeout(700);
}
await shot(s, "bs7-s1r60-wizard-location-step", { fullPage: false });
console.log("fields:", await page.locator("main input:visible, main select:visible").evaluateAll((es) => es.map((e) => `${e.type}:${e.name || e.placeholder || e.getAttribute("aria-label")}:${(e.value || "").slice(0, 20)}`)).then((a) => a.slice(0, 12)));
await s.close();
