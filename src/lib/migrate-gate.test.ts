import assert from "node:assert/strict";
import test from "node:test";

import { migrateDecision } from "../../scripts/migrate-gate.ts";

test("Vercel production build migrates", () => {
  const d = migrateDecision({ VERCEL: "1", VERCEL_ENV: "production" });
  assert.equal(d.run, true);
});

test("Vercel preview build skips", () => {
  const d = migrateDecision({ VERCEL: "1", VERCEL_ENV: "preview" });
  assert.equal(d.run, false);
  assert.match(d.reason, /VERCEL_ENV=preview/);
});

test("Vercel development and custom environments skip", () => {
  assert.equal(migrateDecision({ VERCEL: "1", VERCEL_ENV: "development" }).run, false);
  assert.equal(migrateDecision({ VERCEL: "1", VERCEL_ENV: "staging" }).run, false);
});

test("Vercel build with VERCEL_ENV missing or empty skips (fail safe)", () => {
  assert.equal(migrateDecision({ VERCEL: "1" }).run, false);
  assert.equal(migrateDecision({ VERCEL: "1", VERCEL_ENV: "" }).run, false);
  assert.match(migrateDecision({ VERCEL: "1" }).reason, /\(unset\)/);
});

test("VERCEL unset or empty (local, CI, staging workflows) migrates", () => {
  assert.equal(migrateDecision({}).run, true);
  assert.equal(migrateDecision({ VERCEL: "" }).run, true);
  assert.equal(migrateDecision({ VERCEL_ENV: "preview" }).run, true);
});

test("MIGRATE_ALLOW=1 overrides a Vercel preview skip; other values do not", () => {
  assert.equal(migrateDecision({ VERCEL: "1", VERCEL_ENV: "preview", MIGRATE_ALLOW: "1" }).run, true);
  assert.equal(migrateDecision({ VERCEL: "1", VERCEL_ENV: "preview", MIGRATE_ALLOW: "true" }).run, false);
  assert.equal(migrateDecision({ VERCEL: "1", VERCEL_ENV: "preview", MIGRATE_ALLOW: "0" }).run, false);
});
