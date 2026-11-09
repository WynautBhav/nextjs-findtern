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

// pg lets ?host= / ?hostaddr= in the query string override the authority, so a local-looking authority proves nothing.
for (const url of [
  "postgresql://u:***@localhost/findtern?host=evil.invalid",
  "postgresql://u:***@127.0.0.1:5432/findtern?sslmode=require&host=evil.invalid",
  "postgresql://u:***@localhost/findtern?hostaddr=evil.invalid",
  "postgresql://u:***@localhost/findtern?HOST=evil.invalid",
]) {
  test(`seed refuses a host override in the query string: ${url.split("?")[1]}`, () => {
    const r = run(url);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Refusing to seed: DATABASE_URL has a ".+" query parameter/);
    assert.doesNotMatch(r.stdout, /Cleaning existing tables/);
  });
}

test("the e2e env guard refuses the same query-string host override, and still accepts a plain local URL", async () => {
  const { testDatabaseUrl } = await import("../../e2e/lib/env.mjs");
  assert.throws(() => testDatabaseUrl("postgresql://u:***@localhost/db?host=evil.invalid"), /query parameter/);
  assert.throws(() => testDatabaseUrl("postgresql://u:***@localhost/db?hostaddr=evil.invalid"), /query parameter/);
  assert.throws(() => testDatabaseUrl("postgresql://u:***@db.example.invalid/db"), /not localhost/);
  const ok = "postgresql://u:***@localhost:5433/db?sslmode=disable";
  assert.equal(testDatabaseUrl(ok), ok);
});
