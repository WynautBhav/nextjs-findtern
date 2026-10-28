// Tester B, 28 Oct: does /admin/account gate submit on the one rule it states? (local copy; never submits)
import { open } from "./lib.mjs";
const s = await open({ port: 3502, role: "admin", email: "staff5@qa.invalid", password: "E2e#Admin2026", name: "qa016-enforce" });
const { page } = s;
await page.goto(s.url("/admin/account"), { waitUntil: "networkidle" });
const pw = page.locator("input[type=password]");
console.log("password fields:", await pw.count(), "| hint:", (await page.locator("main").innerText()).match(/At least 8[^.]*\./)?.[0]);
for (const [next, label] of [["abcdefgh", "lowercase only, 8"], ["Abcdef1", "7 chars, no symbol"], ["Abcdefg1", "8 chars, no special"], ["abcdef1!", "8 chars, no uppercase"], ["ABCDEF1!", "8 chars, no lowercase"], ["Abcdefgh!", "8 chars, no number"], ["Abcdef1!", "meets the stated rule"]]) {
  await pw.nth(0).fill("E2e#Admin2026"); await pw.nth(1).fill(next); if ((await pw.count()) > 2) await pw.nth(2).fill(next);
  await page.waitForTimeout(150);
  const btn = page.getByRole("button", { name: "Change password" });
  const off = await btn.isDisabled();
  let msg = "";
  if (!off && next !== "Abcdef1!") { await btn.click(); await page.waitForTimeout(1200); msg = (await page.locator("main").innerText()).replace(/\s+/g, " ").match(/(must|at least|too short|weak|invalid|incorrect|updated|changed)[^.]{0,80}/i)?.[0] ?? "(no message)"; await page.goto(s.url("/admin/account"), { waitUntil: "networkidle" }); }
  console.log(label.padEnd(24), next.padEnd(11), "Change password disabled:", off, msg);
}
await s.close();
