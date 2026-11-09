import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { RateLimiter } from "../security/rate-limit.ts";

/**
 * The presence e2e retries past a 429 from the heartbeat limiter, which would also hide someone loosening or
 * tightening it. This pins the numbers. store.ts imports the db through the "@/" alias, which plain node cannot
 * resolve, so the constructor arguments are read from the source and then exercised on a real RateLimiter.
 */
const src = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
const m = src.match(/export const heartbeatLimiter = new RateLimiter\((\d+),\s*([\d_]+)\)/);

test("heartbeatLimiter is 6 per 60 s", () => {
  assert.ok(m, "heartbeatLimiter declaration not found in store.ts");
  assert.equal(Number(m[1]), 6);
  assert.equal(Number(m[2].replaceAll("_", "")), 60_000);
});

test("a 6-per-60s limiter allows 6 heartbeats, refuses the 7th, and frees up when the window ends", () => {
  assert.ok(m);
  const l = new RateLimiter(Number(m[1]), Number(m[2].replaceAll("_", "")));
  const t0 = 1_000_000;
  for (let i = 0; i < 6; i++) assert.equal(l.take("u1", t0 + i), true);
  assert.equal(l.take("u1", t0 + 10), false);
  assert.equal(l.take("u2", t0 + 10), true, "per-user");
  assert.equal(l.take("u1", t0 + 59_999), false);
  assert.equal(l.take("u1", t0 + 60_000), true);
});
