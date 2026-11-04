import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "src/app/api/admin";
const files = (d: string): string[] =>
  readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? files(join(d, n)) : n === "route.ts" ? [join(d, n)] : []));

// The login cookie's permissions go stale when a role changes (BUG-WP4-01).
test("no admin route authorizes from the cookie's permissions", () => {
  const bad = files(root).filter((f) => {
    const s = readFileSync(f, "utf8");
    return /security\/guards"/.test(s) && /requireRole\(/.test(s) && /\.permissions/.test(s);
  });
  assert.deepEqual(bad, []);
});
