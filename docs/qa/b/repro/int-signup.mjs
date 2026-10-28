import { readFileSync, readdirSync, existsSync } from "node:fs";
import { open, shot, text, ROOT } from "./lib.mjs";
import { join } from "node:path";
const PORT = 3502, W = Number(process.argv[2] ?? 375), ENGINE = process.argv[3] ?? "chromium";
const email = `qa.b.intern.${Date.now() % 1e7}@gmail.com`;
export function lastOtp(to) {
  const dir = join(ROOT, "logs", "mail");
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).sort().pop();
  const body = readFileSync(join(dir, f), "utf8");
  const blocks = body.split(/\n(?=-{3,}|={3,}|\[)/).filter((b) => b.includes(to));
  const last = blocks.pop() ?? "";
  return last.match(/code:\s*(\d{6})/)?.[1] ?? null;
}
const s = await open({ port: PORT, width: W, engine: ENGINE, name: `int-signup-${W}-${ENGINE}` });
const p = s.page;
p.on("response", async (r) => { if (r.url().includes("/api/auth/")) console.log("  net", r.request().method(), new URL(r.url()).pathname, r.status(), (await r.text().catch(() => "")).slice(0, 120)); });
await p.goto(s.url("/signup"), { waitUntil: "networkidle" });
await p.getByLabel("First name").fill("Qab");
await p.getByLabel("Last name").fill("Tester");
await p.getByLabel("Email").fill(email);
await p.getByLabel("Phone number").fill("9" + String(Math.floor(Math.random() * 9e8) + 1e8).replace(/(\d)\1{3,}/g, "7241"));
await p.getByLabel("Password", { exact: true }).fill("Qa#Tester2026");
await p.locator("input[type=checkbox]").first().check();
await shot(s, `int-signup-filled-${W}-${ENGINE}`, { fullPage: true });
await p.getByRole("button", { name: /send verification code/i }).click();
await p.waitForTimeout(2500);
console.log("after submit:", (await text(s)).slice(0, 300));
await shot(s, `int-signup-otp-${W}-${ENGINE}`, { fullPage: false });
const otp = lastOtp(email);
console.log("otp found:", !!otp, email);
if (otp) {
  const box = p.locator("input[inputmode=numeric], input[autocomplete=one-time-code]").first();
  console.log("otp input attrs:", await box.evaluate((e) => ({ type: e.type, inputmode: e.inputMode, autocomplete: e.autocomplete, maxlength: e.maxLength })));
  await box.fill(otp); await p.waitForTimeout(2000);
  await p.getByRole("button", { name: /verify|create|continue/i }).first().click();
  await p.waitForTimeout(3000);
  console.log("landed:", new URL(p.url()).pathname);
}
console.log(s.errors);
await shot(s, `int-signup-after-${W}-${ENGINE}`, { fullPage: false });
await s.close();
console.log("EMAIL", email);
