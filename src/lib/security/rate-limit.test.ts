import test, { after, afterEach } from "node:test";
import assert from "node:assert/strict";

import { RateLimiter, bucketKey, isBypassedKey, takeAuth } from "./rate-limit.ts";

const ORIGINAL_ORIGIN = process.env.PUBLIC_ORIGIN;
// The bypass only works on a staging host, so the tests run as one.
process.env.PUBLIC_ORIGIN = "https://nextjs-findtern.vercel.app";

afterEach(() => {
  delete process.env.RATE_LIMIT_BYPASS_IPS;
  process.env.PUBLIC_ORIGIN = "https://nextjs-findtern.vercel.app";
});
after(() => {
  if (ORIGINAL_ORIGIN === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = ORIGINAL_ORIGIN;
});

function exhaust(limiter: RateLimiter, key: string, n: number): boolean[] {
  return Array.from({ length: n }, () => limiter.take(key));
}

test("limits as before when no bypass is set", () => {
  const l = new RateLimiter(3, 60_000);
  assert.deepEqual(exhaust(l, bucketKey("1.2.3.4", "a@x.in"), 5), [true, true, true, false, false]);
});

test("a bypassed address is never limited, others still are", () => {
  process.env.RATE_LIMIT_BYPASS_IPS = " 9.9.9.9 , 2401:db8::1 ";
  const l = new RateLimiter(2, 60_000);
  assert.deepEqual(exhaust(l, bucketKey("9.9.9.9", "a@x.in"), 5), [true, true, true, true, true]);
  assert.deepEqual(exhaust(l, bucketKey("2401:db8::1", "a@x.in"), 4), [true, true, true, true], "IPv6 keeps its colons");
  assert.deepEqual(exhaust(l, bucketKey("1.2.3.4", "a@x.in"), 4), [true, true, false, false]);
});

test("an address that merely starts with a bypassed one is not bypassed", () => {
  process.env.RATE_LIMIT_BYPASS_IPS = "9.9.9.9";
  assert.equal(isBypassedKey(bucketKey("9.9.9.99", "a")), false);
  assert.equal(isBypassedKey(bucketKey("19.9.9.9", "a")), false);
  assert.equal(isBypassedKey(bucketKey("9.9.9.9")), true);
});

test("\"unknown\" is never bypassed, even if listed", () => {
  process.env.RATE_LIMIT_BYPASS_IPS = "unknown,9.9.9.9";
  const l = new RateLimiter(1, 60_000);
  assert.deepEqual(exhaust(l, bucketKey("unknown", "a"), 3), [true, false, false]);
});

test("a limiter marked not bypassable ignores the list", () => {
  process.env.RATE_LIMIT_BYPASS_IPS = "9.9.9.9";
  const guess = new RateLimiter(2, 60_000, { bypassable: false });
  assert.deepEqual(exhaust(guess, bucketKey("9.9.9.9", "a"), 4), [true, true, false, false]);
  assert.deepEqual(exhaust(guess, "row-uuid-without-an-ip", 3), [true, true, false], "keys without an address are unaffected");
});

test("takeAuth, including its per-address ceiling, honours the bypass", () => {
  process.env.RATE_LIMIT_BYPASS_IPS = "9.9.9.9";
  const login = new RateLimiter(2, 60_000);
  const results = Array.from({ length: 200 }, (_, i) => takeAuth(login, "login", "9.9.9.9", `user${i % 3}@x.in`));
  assert.equal(results.every(Boolean), true);
  const other = Array.from({ length: 3 }, () => takeAuth(login, "login", "1.2.3.4", "user@x.in"));
  assert.deepEqual(other, [true, true, false]);
});

test("unsetting the variable takes effect on the next call", () => {
  const l = new RateLimiter(1, 60_000);
  process.env.RATE_LIMIT_BYPASS_IPS = "9.9.9.9";
  assert.deepEqual(exhaust(l, bucketKey("9.9.9.9", "a"), 3), [true, true, true]);
  delete process.env.RATE_LIMIT_BYPASS_IPS;
  assert.deepEqual(exhaust(l, bucketKey("9.9.9.9", "b"), 3), [true, false, false]);
});

test("the bypass does nothing on the real domain, or when the origin is unknown", () => {
  process.env.RATE_LIMIT_BYPASS_IPS = "9.9.9.9";
  for (const origin of ["https://findtern.in", "https://www.findtern.in", "https://findtern.in.", undefined, ""]) {
    if (origin === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = origin;
    const l = new RateLimiter(2, 60_000);
    assert.deepEqual(exhaust(l, bucketKey("9.9.9.9", "a"), 4), [true, true, false, false], `limited on ${JSON.stringify(origin)}`);
  }
});
