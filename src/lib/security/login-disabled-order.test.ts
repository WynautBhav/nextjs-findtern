import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../app/api/auth/", import.meta.url).pathname;
const src = (p: string) => readFileSync(join(root, p), "utf8");

// The "this account is disabled" answer tells the asker the account exists, so it may only follow proof of who they are.
for (const [name, file, credential] of [
  ["intern", "login/route.ts", "verifyPassword("],
  ["employer", "employer/login/route.ts", "verifyPassword("],
  ["college", "college/login/route.ts", "verifyPassword("],
] as const) {
  test(`${name} login: disabled is answered only after the password is verified, with the shared message`, () => {
    const s = src(file);
    const proof = s.indexOf(credential);
    const disabled = s.indexOf("accountDisabledBody()");
    assert.ok(proof > 0 && disabled > 0, "both present");
    assert.ok(proof < disabled, "password check comes before the disabled answer");
    // The password branch ends in a generic answer for unknown email and wrong password alike.
    assert.ok(s.slice(proof, disabled).includes("status: 401"), "wrong password / unknown email answers 401 first");
  });
}

test("google callback: the disabled banner comes only after Google verified the email", () => {
  const s = src("google/callback/route.ts");
  const verified = s.indexOf("profile.email_verified");
  const first = s.indexOf(", \"inactive\")");
  assert.ok(verified > 0 && first > verified);
  assert.ok(s.includes("ACCOUNT_DISABLED_REASON"));
});

test("no old, inconsistent deactivated wording is left in the auth routes", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  for (const f of walk(root)) {
    const s = readFileSync(f, "utf8");
    for (const old of ["Account deactivated", "switched off. Contact Findtern", "has been deactivated. Contact"]) assert.ok(!s.includes(old), `${f} still says "${old}"`);
  }
});

test("routes that answer 'not signed in' go through unauthenticatedResponse, so a disabled account gets ACCOUNT_DISABLED everywhere", () => {
  const api = new URL("../../app/api/", import.meta.url).pathname;
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f === "route.ts" ? [join(d, f)] : []));
  const offenders: string[] = [];
  for (const f of walk(api)) {
    if (/\/api\/(admin|cron|webhooks|auth\/(login|employer|college|admin|google)|users\/\[id\]\/change-password|employer\/\[id\]\/change-password)/.test(f)) continue;
    const s = readFileSync(f, "utf8");
    if (s.includes("getSession(") && /!session[^\n]*status: 401/.test(s)) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});
