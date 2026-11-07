import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// No DB harness for these queries, so pin the verified-only filter on every
// college-role surface that reads memberships straight from SQL (Q27).
const src = readFileSync(join(import.meta.dirname, "../college/scope.ts"), "utf8");

function body(name: string): string {
  const at = src.indexOf(`export async function ${name}(`);
  assert.ok(at >= 0, name);
  const next = src.indexOf("\nexport ", at + 10);
  return src.slice(at, next < 0 ? undefined : next);
}

test("TPO presence snapshot lists verified members only", () => {
  assert.match(body("presenceSnapshot"), /\$\{m\.leftAt\} IS NULL AND \$\{m\.status\} = 'verified'/);
});

test("roster coverage counts only verified members as joined", () => {
  assert.match(body("rosterCoverage"), /m\.left_at IS NULL AND m\.status = 'verified'/);
});
