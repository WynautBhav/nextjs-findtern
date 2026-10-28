// Tester B, 28 Oct: QA-016 retest. A password that meets "upper, lower, number" but has no special character:
// what does the server tell the user? (throwaway staff5 on the local copy; the change is rejected)
import { open, shot } from "./lib.mjs";
const s = await open({ port: 3502, role: "admin", email: "staff5@qa.invalid", password: "E2e#Admin2026", name: "qa016-error-text" });
await s.page.goto(s.url("/admin/account"), { waitUntil: "networkidle" });
const pw = s.page.locator("input[type=password]");
await pw.nth(0).fill("E2e#Admin2026"); await pw.nth(1).fill("Abcdefg1"); await pw.nth(2).fill("Abcdefg1");
await s.page.getByRole("button", { name: "Change password" }).click(); await s.page.waitForTimeout(1500);
const body = (await s.page.locator("main").innerText()).replace(/\s+/g, " ");
console.log("hint on page :", body.match(/At least 8[^.]*\./)?.[0]);
console.log("server error :", body.match(/Use 8\+[^.]*\./)?.[0]);
await shot(s, "qa016r-weak-password-error", { fullPage: false });
await s.close();
