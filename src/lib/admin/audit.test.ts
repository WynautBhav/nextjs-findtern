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
  const meta = { password: "Hunter2!", newPassword: "x", token: "t", bankAccountNumber: "123456789012", note: "paid to 987654321098", nested: { secret: "s", ok: 1 } };
  const out = summarizeMeta(meta);
  for (const leak of ["Hunter2!", "123456789012", "987654321098", '"s"']) assert.ok(!out.includes(leak), `leaked ${leak}`);
  assert.ok(out.includes("9012") && out.includes("[hidden]") && out.includes("ok"));
  assert.deepEqual(redactMeta({ a: [{ passwordHash: "h" }] }), { a: [{ passwordHash: "[hidden]" }] });
});
