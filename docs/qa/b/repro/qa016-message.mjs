// Tester B, 28 Oct: QA-016 second retest. For each weak password, what does the page say after Change password?
import { open, shot } from "./lib.mjs";
const s = await open({ port: 3502, role: "admin", email: "staff5@qa.invalid", password: "E2e#Admin2026", name: "qa016-message" });
const { page } = s;
const before = async () => (await page.locator("main").innerText()).replace(/\s+/g, " ");
for (const next of ["Abcdefg1", "abcdefgh", "Abcdef1", "abcdef1!", "ABCDEF1!", "Abcdefgh!"]) {
  await page.goto(s.url("/admin/account"), { waitUntil: "networkidle" });
  const b = await before();
  const pw = page.locator("input[type=password]");
  await pw.nth(0).fill("E2e#Admin2026"); await pw.nth(1).fill(next); await pw.nth(2).fill(next);
  await page.getByRole("button", { name: "Change password" }).click(); await page.waitForTimeout(1500);
  const a = await before();
  const added = a.split(/(?<=[.!?])\s/).filter((x) => !b.includes(x));
  console.log(next.padEnd(10), "→", added.length ? added.join(" | ") : "(no new text; inline: " + (await page.locator("[role=alert], .text-danger").allInnerTexts()).join(" | ") + ")");
  if (next === "Abcdefg1") await shot(s, "qa016r2-weak-password-error", { fullPage: false });
}
await s.close();
