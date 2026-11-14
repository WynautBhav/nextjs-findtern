import assert from "node:assert/strict";
import { test } from "node:test";

import { RateLimiter } from "../security/rate-limit.ts";
import { takeCodeAttempt } from "./code-throttle.ts";

const fresh = () => ({ user: new RateLimiter(10, 15 * 60_000), ip: new RateLimiter(30, 15 * 60_000), userDay: new RateLimiter(30, 24 * 3600_000) });
const T0 = 1_000_000;

test("11th attempt in 15 minutes by one user is refused, with a retry time", () => {
  const t = fresh();
  for (let i = 0; i < 10; i++) assert.deepEqual(takeCodeAttempt({ uid: "u1", ip: "1.1.1.1", now: T0 + i }, t), { ok: true });
  const denied = takeCodeAttempt({ uid: "u1", ip: "1.1.1.1", now: T0 + 20 }, t);
  assert.equal(denied.ok, false);
  assert.ok(!denied.ok && denied.retryAfterSeconds > 800 && denied.retryAfterSeconds <= 900);
});

test("after the window the user may try again, but the day budget caps the total at 30", () => {
  const t = fresh();
  let allowed = 0;
  for (let w = 0; w < 5; w++) {
    for (let i = 0; i < 12; i++) if (takeCodeAttempt({ uid: "u1", ip: "1.1.1.1", now: T0 + w * 16 * 60_000 + i }, t).ok) allowed += 1;
  }
  assert.equal(allowed, 30);
  const last = takeCodeAttempt({ uid: "u1", ip: "1.1.1.1", now: T0 + 6 * 16 * 60_000 }, t);
  assert.ok(!last.ok && last.retryAfterSeconds > 3600, "day lockout is hours, not minutes");
});

test("pressing the button while paused does not spend the day budget", () => {
  const t = fresh();
  for (let i = 0; i < 200; i++) takeCodeAttempt({ uid: "u1", ip: "1.1.1.1", now: T0 + i }, t);
  assert.equal(t.userDay.remaining("ud:u1", T0 + 300), 20);
});

test("one address is capped across many accounts, and one account across many addresses", () => {
  const t = fresh();
  let ok = 0;
  for (let i = 0; i < 40; i++) if (takeCodeAttempt({ uid: `acct${i}`, ip: "9.9.9.9", now: T0 + i }, t).ok) ok += 1;
  assert.equal(ok, 30);
  let ok2 = 0;
  for (let i = 0; i < 20; i++) if (takeCodeAttempt({ uid: "solo", ip: `10.0.0.${i}`, now: T0 + i }, t).ok) ok2 += 1;
  assert.equal(ok2, 10);
});

test("the named limiters the route uses are never bypassable", async () => {
  const { limiters } = await import("../security/rate-limit.ts");
  const key = "ip:127.0.0.1";
  let ok = 0;
  for (let i = 0; i < 40; i++) if (limiters.collegeCodeIp.take(key, T0)) ok += 1;
  assert.equal(ok, 30);
  limiters.collegeCodeIp.reset(key);
});
