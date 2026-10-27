import { open, shot } from "./lib.mjs";
import { lastOtp, saveState, body } from "./bs7-employer-lib.mjs";
import { step1 } from "./bs7-employer-onb-lib.mjs";
const email = `qa.b.emp.${Math.floor(100000 + Math.random() * 899999)}@acme-qa-test.in`;
const s = await open({ port: 3502, width: 375, height: 812, name: "bs7-emp-gate" });
const p = s.page;
await p.goto(s.url("/employer/signup"), { waitUntil: "networkidle" });
await p.locator("input[name=name]").fill("Qa Gate");
await p.locator("input[name=companyName]").fill("Acme QA Gate");
await p.locator("input[name=companyEmail]").fill(email);
await p.locator("input[name=phoneNumber]").fill("9871203645");
await p.locator("input[name=password]").fill("Qa#Tester2026");
await p.locator("input[type=checkbox]").first().check();
await p.waitForTimeout(1500);
await p.getByRole("button", { name: /send verification code/i }).click(); await p.waitForTimeout(2500);
await p.locator("input[autocomplete=one-time-code]").fill(lastOtp(email));
await p.getByRole("button", { name: /verify/i }).first().click(); await p.waitForTimeout(4000);
console.log("landed:", new URL(p.url()).pathname);
saveState({ email3: email });
const visit = async (label) => {
  for (const path of ["/employer/dashboard", "/employer/candidates", "/employer/projects", "/employer/cart", "/employer/orders", "/employer/send-proposal"]) {
    await p.goto(s.url(path), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1800);
    console.log(label, path, "->", new URL(p.url()).pathname);
  }
};
await visit("before step1:");
await shot(s, "bs7-emp-gate-dashboard-before-1", { fullPage: false });
await p.goto(s.url("/employer/onboarding"), { waitUntil: "networkidle" });
await step1(p, email);
console.log("after step1 on:", new URL(p.url()).pathname, (await body(p)).match(/Your first project/)?.[0]);
await visit("after step1 (no project):");
await shot(s, "bs7-emp-gate-dashboard-after-1", { fullPage: false });
console.log((await body(p)).slice(0, 300));
await s.close();
