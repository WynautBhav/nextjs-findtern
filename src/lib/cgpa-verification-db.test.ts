import assert from "node:assert/strict";
import { register } from "node:module";
import test, { beforeEach } from "node:test";

/** pendingCgpaCount: the admin nav badge. One bounded count query; any failure is 0, never a thrown page. */

register("./admin/test-support/sem-hooks.mjs", import.meta.url);
const fakes = (await import("./admin/test-support/sem-fakes.mjs")) as typeof import("./admin/test-support/sem-fakes.mjs");
const { pendingCgpaCount } = await import("./cgpa-verification-db.ts");

type Fake = { execute: unknown; calls: { op: string; sql?: string }[]; dbDown: boolean; noDb: boolean; failExecute: boolean };
const sem = () => (globalThis as unknown as { __sem: Fake }).__sem;
beforeEach(() => fakes.reset());

test("returns the count the database gives", async () => {
  sem().execute = [{ value: 7 }];
  assert.equal(await pendingCgpaCount(), 7);
});

test("a count that arrives as a string (bigint from Postgres) is a number", async () => {
  sem().execute = [{ value: "12" }];
  assert.equal(await pendingCgpaCount(), 12);
});

test("no rows or a junk value is 0", async () => {
  sem().execute = [];
  assert.equal(await pendingCgpaCount(), 0);
  sem().execute = [{ value: null }];
  assert.equal(await pendingCgpaCount(), 0);
  sem().execute = [{ value: "many" }];
  assert.equal(await pendingCgpaCount(), 0);
  sem().execute = [{ value: -3 }];
  assert.equal(await pendingCgpaCount(), 0);
});

test("one single read-only query on intern_onboarding, counting status = pending", async () => {
  sem().execute = [{ value: 1 }];
  await pendingCgpaCount();
  assert.equal(sem().calls.length, 1);
  const text = sem().calls[0].sql ?? "";
  assert.match(text, /^\s*select count\(\*\)/i);
  assert.match(text, /from "?intern_onboarding"?/i);
  assert.match(text, /extra_data->'cgpaVerification'->>'status'/);
  assert.match(text, /'pending'|\$1/);
  assert.doesNotMatch(text, /\b(insert|update|delete)\b/i);
});

test("database unreachable, no database, or a failing query: 0, never throws", async () => {
  sem().dbDown = true;
  assert.equal(await pendingCgpaCount(), 0);
  fakes.reset();
  sem().noDb = true;
  assert.equal(await pendingCgpaCount(), 0);
  fakes.reset();
  sem().failExecute = true;
  assert.equal(await pendingCgpaCount(), 0);
});
