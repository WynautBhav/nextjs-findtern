import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { hashPassword, verifyPassword, verifyPasswordOrDummy } from "./password.ts";

const ROUTES = ["auth/login", "auth/employer/login", "auth/admin/login", "auth/college/login"];

test("login routes never skip the password hash for an unknown email (user enumeration by timing)", () => {
  for (const r of ROUTES) {
    const src = readFileSync(join(import.meta.dirname, "../../app/api", r, "route.ts"), "utf8");
    assert.match(src, /verifyPasswordOrDummy\(/, `${r} must verify against a dummy hash when no account matches`);
    assert.doesNotMatch(src, /!\w+(\.\w+)?\s*\|\|\s*!\(await verifyPassword\(/, `${r} short-circuits before hashing`);
  }
});

test("an unknown account costs about as much as a wrong password", async () => {
  const stored = await hashPassword("Correct-Horse-9");
  await verifyPassword("warm-up", stored);
  await verifyPasswordOrDummy("warm-up", undefined);
  const time = async (f: () => Promise<boolean>) => {
    const t = performance.now();
    const ok = await f();
    assert.equal(ok, false);
    return performance.now() - t;
  };
  const wrong = await time(() => verifyPassword("nope-nope-1", stored));
  const unknown = await time(() => verifyPasswordOrDummy("nope-nope-1", undefined));
  assert.ok(unknown > wrong * 0.4, `unknown ${unknown.toFixed(1)}ms vs wrong ${wrong.toFixed(1)}ms`);
  assert.equal(await verifyPasswordOrDummy("Correct-Horse-9", stored), true);
});
