// WebKit signup. Playwright WebKit drops the Secure ft_otp cookie on plain-http localhost, so the verify-otp
// response's Set-Cookie is rewritten without "Secure" (test-environment accommodation only).
import { open, shot } from "./lib.mjs";
import { lastOtp, saveState, body } from "./bs7-employer-lib.mjs";
const log=[]; const email = `qa.b.emp.${Math.floor(100000 + Math.random() * 899999)}@acme-qa-test.ae`;
const s = await open({ port: 3502, width: 375, height: 812, engine: "chromium", name: "bs7-emp-wk-signup" });
const p = s.page;
await p.route("**/api/auth/signup/verify-otp", async (route) => {
  const r = await route.fetch();
  const h = r.headers();
  const sc = (h["set-cookie"] || "").replace(/;\s*Secure/gi, "");
  await route.fulfill({ response: r, headers: { ...h, "set-cookie": sc } });
});
p.on("response", async (r) => { if (r.url().includes("/api/auth/")) console.log("RESP", r.status(), r.url().replace(s.origin,""), (await r.text().catch(()=>"")).slice(0,120)); });
await p.goto(s.url("/employer/signup"), { waitUntil: "networkidle" });
await p.locator("input[name=name]").fill("Qa Employer");
await p.locator("input[name=companyName]").fill("Acme QA Gulf");
await p.locator("input[name=companyEmail]").fill(email);
const code = p.locator("select").first();
await code.selectOption({ label: "+971 · United Arab Emirates" }).catch(async () => { console.log("code opts:", (await code.locator("option").allTextContents()).filter(t=>/971|Emirates/.test(t))); });
await p.locator("input[name=phoneNumber]").fill("501234987");
await p.locator("input[name=password]").fill("Qa#Tester2026");
await p.locator("input[type=checkbox]").first().check();
await p.waitForTimeout(1500);
console.log("phone err:", (await body(p)).match(/(That number|phone)[^.]{0,80}\./)?.[0]);
await p.getByRole("button", { name: /send verification code/i }).click({ timeout: 8000 }).catch((e) => console.log("send disabled:", e.message.slice(0, 60)));
await p.waitForTimeout(2500);
const otp = lastOtp(email);
console.log("otp", !!otp);
await p.locator("input[autocomplete=one-time-code]").fill(otp);
await p.getByRole("button", { name: /verify/i }).first().click(); await p.waitForTimeout(4000);
console.log((await body(p)).slice(100,420));
console.log("cookies", (await s.ctx.cookies()).map(c=>c.name));
console.log("landed:", new URL(p.url()).pathname);
saveState({ emailW: email });
await shot(s, "bs7-emp-wk-signup-after", { fullPage: false });
await s.close();
console.log("EMAIL", email);
