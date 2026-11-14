import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { isLockedApi } from "../intern-lock.ts";

const API = join(import.meta.dirname, "../../app/api");
const SRC = join(import.meta.dirname, "../..");

function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? routes(join(dir, e.name)) : e.name === "route.ts" ? [join(dir, e.name)] : [],
  );
}

/** A concrete URL for a route file: api/threads/[id]/read/route.ts -> /api/threads/x/read */
const urlOf = (f: string) => "/api/" + relative(API, f).replace(/\/?route\.ts$/, "").replace(/\[[^\]]+\]/g, "x");

test("every API an unpaid intern is refused at the proxy also re-checks in the route (a second line, not just the proxy)", () => {
  const missing: string[] = [];
  let checked = 0;
  for (const f of routes(API)) {
    if (!isLockedApi(urlOf(f))) continue;
    const src = readFileSync(f, "utf8");
    // Only routes an intern session can reach: roles list names "intern", or the route reads the session itself
    // (threads and the offer letter are shared by both parties).
    const reachableByIntern = /roles:\s*\[[^\]]*"intern"/.test(src) || /\/threads|offer-letter/.test(urlOf(f));
    if (!reachableByIntern) continue;
    checked++;
    if (!/internLockResponse\(/.test(src)) missing.push(relative(API, f));
  }
  assert.ok(checked >= 10, `expected to check the locked intern routes, checked ${checked}`);
  assert.deepEqual(missing, []);
});

test("the pay flow, uploads, notifications and sign-out are never behind the lock", () => {
  for (const f of routes(API)) {
    const u = urlOf(f);
    if (/\/payment\/|\/drive-codes\/|\/uploads|\/notifications|\/auth\/|\/onboarding|\/avatar|\/terms\//.test(u)) {
      assert.equal(isLockedApi(u), false, u);
      assert.doesNotMatch(readFileSync(f, "utf8"), /internLockResponse\(/, u);
    }
  }
});

test("the proxy runs the lock for intern pages and intern API calls, and the layout re-checks", () => {
  const proxy = readFileSync(join(SRC, "proxy.ts"), "utf8");
  assert.match(proxy, /internGate\(req, session, pathname, false\)/);
  assert.match(proxy, /internGate\(req, session, pathname, true\)/);
  assert.match(proxy, /role === "intern"/);
  const layout = readFileSync(join(SRC, "app/intern/layout.tsx"), "utf8");
  assert.match(layout, /internUnlockState/);
  assert.match(layout, /redirect\(lockedHref\(here\)\)/);
});

test("only a positive answer is cached, so paying unlocks on the next request", () => {
  const src = readFileSync(join(SRC, "lib/intern-unlock.ts"), "utf8");
  // "locked" and "unknown" paths never write to the cache; the only set() follows an unlock reason.
  assert.equal((src.match(/unlockedAt\.set\(/g) ?? []).length, 1);
  assert.match(src, /if \(!reason\) \{\s*unlockedAt\.delete\(uid\);\s*return "locked";/);
});
