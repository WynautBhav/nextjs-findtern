import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { AUDIT_ACTIONS, actionLabel, redactMeta, summarizeMeta } from "./audit.ts";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

test("every audit action written in src has a human label", () => {
  const written = new Set<string>();
  for (const f of walk("src")) {
    const text = readFileSync(f, "utf8");
    if (!text.includes("recordAdminAudit(")) continue;
    for (const m of text.matchAll(/action:\s*"([a-z_]+\.[a-z_]+)"/g)) written.add(m[1]);
  }
  assert.ok(written.size >= 25, `found only ${written.size} actions`);
  for (const a of written) assert.ok(a in AUDIT_ACTIONS, `no label for ${a}`);
  for (const a of Object.keys(AUDIT_ACTIONS)) assert.notEqual(actionLabel(a), a);
});

test("details summary hides passwords and masks account numbers", () => {
  const meta = { password: "Hunter2!", newPassword: "x", token: "t", bankAccountNumber: "123456789012", note: "paid to a/c 987654321098", nested: { secret: "s", ok: 1 } };
  const out = summarizeMeta(meta);
  for (const leak of ["Hunter2!", "123456789012", "987654321098", '"s"']) assert.ok(!out.includes(leak), `leaked ${leak}`);
  assert.ok(out.includes("9012") && out.includes("[hidden]") && out.includes("ok"));
  assert.deepEqual(redactMeta({ a: [{ passwordHash: "h" }] }), { a: [{ passwordHash: "[hidden]" }] });
});

test("phone numbers and payout references are kept; only account-number keys are masked", () => {
  const out = redactMeta({ phoneNumber: { from: "9876543210", to: "9123456780" }, referenceId: "412345678901", note: "call 9876543210, UTR 412345678901" }) as Record<string, unknown>;
  assert.deepEqual(out, { phoneNumber: { from: "9876543210", to: "9123456780" }, referenceId: "412345678901", note: "call 9876543210, UTR 412345678901" });
  assert.deepEqual(redactMeta({ accountHolder: "Asha Rao", fullAccountNumbers: true }), { accountHolder: "Asha Rao", fullAccountNumbers: true });
});

test("catches api keys, authorization, cookies and sessions, but not a boolean flag", () => {
  const out = redactMeta({ apiKey: "sk_live_abc", api_key: "k", authorization: "Bearer xyz", Authorisation: "b", cookie: "ft_sid=abc", session: "s", credentials: { u: "x" }, credentialsReset: true }) as Record<string, unknown>;
  for (const k of ["apiKey", "api_key", "authorization", "Authorisation", "cookie", "session", "credentials"]) assert.equal(out[k], "[hidden]", k);
  assert.equal(out.credentialsReset, true);
});

test("numeric, spaced and bank-nested account numbers are masked", () => {
  assert.deepEqual(redactMeta({ accountNumber: 123456789012 }), { accountNumber: "••••9012" });
  assert.deepEqual(redactMeta({ acct: "1234 5678 9012" }), { acct: "••••9012" });
  assert.deepEqual(redactMeta({ bank: { number: 123456789012, name: "HDFC" } }), { bank: { number: "••••9012", name: "HDFC" } });
  assert.deepEqual(redactMeta({ note: "a/c 1234 5678 9012" }), { note: "a/c ••••9012" });
  assert.deepEqual(redactMeta({ note: "Account no: 123456789012 paid" }), { note: "Account ••••9012 paid" });
  assert.deepEqual(redactMeta({ number: 123456789012 }), { number: 123456789012 }); // no bank parent, not an account
});
