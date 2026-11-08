import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(import.meta.dirname, "../../app");
const LIB = join(import.meta.dirname, "..");
const takedown = readFileSync(join(APP, "api/admin/projects/[id]/takedown/route.ts"), "utf8");
const restore = readFileSync(join(APP, "api/admin/projects/[id]/restore/route.ts"), "utf8");
const apply = readFileSync(join(LIB, "projects/takedown-apply.ts"), "utf8");

test("takedown and restore are admin-only mutations (CSRF + role guard first)", () => {
  for (const src of [takedown, restore]) {
    assert.match(src, /requireMutation\(\{ req, roles: \["admin"\] \}\)/);
    assert.ok(src.indexOf("requireMutation(") < src.indexOf("req.json()") || src.indexOf("requireMutation(") < src.indexOf("req.text()"));
  }
});

test("takedown body is strict zod with a required, bounded reason", () => {
  assert.match(takedown, /z\.object\(\{ reason: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(TAKEDOWN_REASON_MAX\) \}\)\.strict\(\)/);
});

test("write and audit share one transaction with a strict audit; notification runs after it and is caught", () => {
  assert.match(apply, /db\.transaction\(/);
  assert.match(apply, /recordAdminAudit\(tx,/);
  assert.match(apply, /\{ strict: true \}/);
  assert.ok(apply.indexOf("notify(") > apply.indexOf("db.transaction("));
  assert.match(apply, /tryPublicOrigin\(\)/);
  assert.doesNotMatch(apply, /\borigin\(\)/);
  assert.match(apply, /catch \(err\) \{\s*console\.error\("\[admin\/projects\/takedown\] notify failed"/);
});
