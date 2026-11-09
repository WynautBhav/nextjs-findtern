import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

/**
 * scripts/seed.ts TRUNCATEs users and everything under them. It must refuse a non-local DATABASE_URL before it
 * connects. Fake hosts only (.invalid never resolves); a refusal exits 1 with the guard's message, never a
 * connection error.
 */
const run = (url: string) =>
  spawnSync(process.execPath, ["--experimental-strip-types", "scripts/seed.ts"], {
    env: { ...process.env, DATABASE_URL: url, NODE_ENV: "test", SESSION_SECRET: "seed-guard-test-secret-at-least-32-chars" },
    encoding: "utf8",
    timeout: 30_000,
  });

for (const url of [
  "postgresql://u:p@db.example.invalid:5432/findtern",
  "postgresql://u:p@ep-fake-123.neon.invalid/neondb?sslmode=require",
  "postgresql://u:p@vps.example.invalid:5432/findtern",
  "postgresql://u:p@localhost.example.invalid:5432/findtern",
]) {
  test(`seed refuses a non-local database: ${new URL(url).hostname}`, () => {
    const r = run(url);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Refusing to seed: DATABASE_URL host ".+" is not localhost/);
    assert.doesNotMatch(r.stdout, /Cleaning existing tables/);
  });
}

test("seed refuses an unparseable DATABASE_URL", () => {
  const r = run("not a url");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing to seed: DATABASE_URL is not a valid URL/);
});
