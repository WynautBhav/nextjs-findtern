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

test("both password login routes refuse a frozen account only AFTER the password is proven, and issue no session", () => {
  for (const [path, v] of [["src/app/api/auth/login/route.ts", "user"], ["src/app/api/auth/employer/login/route.ts", "employer"]] as const) {
    const s = src(path);
    const pw = s.indexOf("verifyPasswordOrDummy");
    const hold = s.indexOf(`if (${v}.frozenAt)`);
    const session = s.indexOf("withSession(");
    assert.ok(pw > 0 && hold > pw && session > hold, `${path}: password check < hold refusal < session`);
    assert.match(s.slice(hold, hold + 120), /accountOnHoldBody\(\), \{ status: 403 \}/);
  }
});

test("Google sign in refuses a frozen account too (both roles) and lands on the on-hold page", () => {
  const s = src("src/app/api/auth/google/callback/route.ts");
  assert.match(s, /employer\.frozenAt\) return fail\(req, "\/login\?as=employer", "on_hold"\)/);
  assert.match(s, /user\.frozenAt\) return fail\(req, "\/login\?as=intern", "on_hold"\)/);
  assert.match(s, /onHoldHref/);
});

test("the session facts read the freeze fresh from the row on every request, so existing sessions stop at the next call", () => {
  const s = src("src/lib/account-status.ts");
  assert.match(s, /frozenAt: table\.frozenAt/);
  assert.match(s, /held: Boolean\(row\?\.frozenAt\)/);
  const a = src("src/lib/auth.ts");
  assert.match(a, /isHeld: async \(\) => \(await read\(\)\)\.held/);
  assert.match(a, /state\.held\) return NextResponse\.json\(accountOnHoldBody\(\), \{ status: 403 \}\)/);
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
