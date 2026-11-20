import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ACCOUNT_ON_HOLD_CODE, ACCOUNT_ON_HOLD_MESSAGE, accountOnHoldBody, isAccountOnHoldBody, onHoldHref } from "./account-hold.ts";
import { statusVerdict } from "./account-guard.ts";
import { SITE } from "./content/site.ts";

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the hold copy is the agreed sentence and the contact is the existing admin address, not a new one", () => {
  assert.equal(ACCOUNT_ON_HOLD_MESSAGE, "Your account is on hold. Please contact Findtern admin to restore access.");
  assert.equal(accountOnHoldBody().code, ACCOUNT_ON_HOLD_CODE);
  assert.match(accountOnHoldBody().error, new RegExp(SITE.adminEmail.replace(".", "\\.")));
  assert.equal(isAccountOnHoldBody(accountOnHoldBody()), true);
  assert.equal(onHoldHref("employer"), "/account-on-hold?as=employer");
  assert.equal(onHoldHref("college"), "/account-on-hold?as=intern");
});

test("an open tab learns it was frozen from a 403 ACCOUNT_ON_HOLD (and not from any other 403)", () => {
  assert.equal(statusVerdict(403, accountOnHoldBody()), "held");
  assert.equal(statusVerdict(403, { code: "ACCOUNT_DISABLED" }), "disabled");
  assert.equal(statusVerdict(403, { code: "terms_required" }), "unknown");
});

test("both password login routes let a frozen account in AFTER the password is proven, issue a (restricted) session and say where to land", () => {
  for (const [path, v] of [["src/app/api/auth/login/route.ts", "user"], ["src/app/api/auth/employer/login/route.ts", "employer"]] as const) {
    const s = src(path);
    const pw = s.indexOf("verifyPasswordOrDummy");
    const session = s.indexOf("withSession(");
    assert.ok(pw > 0 && session > pw, `${path}: password check < session`);
    assert.doesNotMatch(s, /accountOnHoldBody/, `${path} no longer refuses a frozen account`);
    assert.match(s, new RegExp(`${v}\\.frozenAt`), `${path} reads the freeze`);
    assert.match(s, /landingAfterLogin/);
    assert.match(s, /onHold: true, landing/);
  }
});

test("Google sign in lets a frozen account in too (both roles) and lands it on the on-hold page", () => {
  const s = src("src/app/api/auth/google/callback/route.ts");
  assert.doesNotMatch(s, /"on_hold"/);
  assert.match(s, /employer\.frozenAt \? landingAfterLogin\(\{ role: "employer"/);
  assert.match(s, /user\.frozenAt \? landingAfterLogin\(\{ role: "intern"/);
});

test("the login form follows the landing the server returns, and has no 'login refused' branch", () => {
  const s = src("src/components/auth/login-form.tsx");
  assert.doesNotMatch(s, /ACCOUNT_ON_HOLD/);
  assert.match(s, /ok\.landing/);
});

test("the session facts read the freeze fresh from the row on every request, so existing sessions stop at the next call", () => {
  const s = src("src/lib/account-status.ts");
  assert.match(s, /frozenAt: table\.frozenAt/);
  assert.match(s, /workExempt: Boolean\(row\?\.frozenAt && row\?\.workExemptAt\)/);
  assert.match(s, /held: Boolean\(row\?\.frozenAt\)/);
  const a = src("src/lib/auth.ts");
  assert.match(a, /isHeld: async \(\) => \(await read\(\)\)\.held/);
  assert.match(a, /state\.held\) return NextResponse\.json\(accountOnHoldBody\(\), \{ status: 403 \}\)/);
  // The restriction is decided centrally from the proxy-stamped path, for every route that asks for a session.
  assert.match(a, /restrictionVerdict\(\{ role: session\.role, frozen: true/);
  const proxy = src("src/proxy.ts");
  assert.match(proxy, /headers\.set\("x-ft-path", `\$\{pathname\}\$\{search\}`\);\n  return withRenewal\(req, session, NextResponse\.next/);
});

test("the on-hold screen renders the message and the contact, and reveals nothing else", () => {
  const s = src("src/app/(auth)/account-on-hold/page.tsx");
  assert.match(s, /ACCOUNT_ON_HOLD_MESSAGE/);
  assert.match(s, /ACCOUNT_ON_HOLD_CONTACT/);
  assert.doesNotMatch(s, /frozenReason|evidence|getDb|loadStanding/);
});

test("frozen interns are hidden through the shared held condition, frozen employers' projects leave discovery", () => {
  assert.match(src("src/lib/employer-visibility.ts"), /\$\{users\.frozenAt\} IS NOT NULL OR EXISTS/);
  const d = src("src/lib/intern-data.ts");
  assert.equal((d.match(/isNull\(schema\.employers\.frozenAt\)/g) ?? []).length, 2);
});

test("the work exemption only counts while a paid hire runs, and an unfreeze clears it and the one-alert marker", () => {
  const a = src("src/lib/auth.ts");
  assert.match(a, /isWorkExempt: async \(role, uid\) => role === "intern" && \(await read\(\)\)\.workExempt && Boolean\(await runningHireOf\(uid\)\)/);
  const d = src("src/lib/moderation/standing-db.ts");
  assert.match(d, /frozenAt === null && subject\.type === "intern"[\s\S]{0,200}workExemptAt: null, workExemptBy: null, workDecisionAt: null, workReviewNotifiedAt: null/);
});
