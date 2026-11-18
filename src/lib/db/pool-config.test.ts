import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SCHEDULER_JITTER_MS,
  SCHEDULER_MIN_DELAY_MS,
  inProcessSchedulersAllowed,
  isPoolerUrl,
  poolIsBusy,
  poolMax,
  schedulerStartDelayMs,
} from "./pool-config.ts";
import { gateLimit } from "../request-gate.ts";

test("scheduler start is 45-90 s after boot, never immediate", () => {
  assert.equal(schedulerStartDelayMs(() => 0), 45_000);
  assert.equal(schedulerStartDelayMs(() => 1), 89_999);
  for (let i = 0; i < 200; i++) {
    const d = schedulerStartDelayMs();
    assert.ok(d >= SCHEDULER_MIN_DELAY_MS && d < SCHEDULER_MIN_DELAY_MS + SCHEDULER_JITTER_MS, String(d));
  }
  assert.equal(schedulerStartDelayMs(() => -5), 45_000, "out-of-range random is clamped");
  assert.equal(schedulerStartDelayMs(() => NaN) >= 45_000, true);
});

test("pool is busy when someone waits or every connection is checked out", () => {
  assert.equal(poolIsBusy({ totalCount: 2, idleCount: 2, waitingCount: 0, max: 5 }), false);
  assert.equal(poolIsBusy({ totalCount: 5, idleCount: 1, waitingCount: 0, max: 5 }), false);
  assert.equal(poolIsBusy({ totalCount: 5, idleCount: 0, waitingCount: 0, max: 5 }), true);
  assert.equal(poolIsBusy({ totalCount: 3, idleCount: 0, waitingCount: 1, max: 5 }), true);
  assert.equal(poolIsBusy({ totalCount: 3, idleCount: 0, waitingCount: 0, max: 5 }), false, "room to open another connection");
});

test("pool size: small on Vercel and behind a pooler, 10 on a long-running server, env override clamped", () => {
  const local = "postgresql://u:p@db.internal:5432/x";
  const pooler = "postgresql://u.ref:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";
  assert.equal(poolMax({}, local), 10);
  assert.equal(poolMax({ VERCEL: "1" }, local), 5);
  assert.equal(poolMax({}, pooler), 5);
  assert.equal(poolMax({ DATABASE_POOL_MAX: "3", VERCEL: "1" }, pooler), 3);
  assert.equal(poolMax({ DATABASE_POOL_MAX: "500" }, local), 20);
  assert.equal(poolMax({ DATABASE_POOL_MAX: "0" }, local), 10, "invalid override ignored");
  assert.equal(isPoolerUrl(local), false);
  assert.equal(isPoolerUrl(pooler), true);
});

test("per-request read gate always leaves two pool connections for other requests' session checks", () => {
  assert.equal(gateLimit({ DATABASE_URL: "postgresql://u:p@db.internal:5432/x" }), 8);
  assert.equal(gateLimit({ VERCEL: "1", DATABASE_URL: "postgresql://u:p@h:5432/x" }), 3);
  assert.equal(gateLimit({ DATABASE_POOL_MAX: "1" }), 2);
});

test("in-process timers: only a long-running server with SCHEDULERS=on; never on Vercel", () => {
  assert.equal(inProcessSchedulersAllowed({ SCHEDULERS: "on" }), true);
  assert.equal(inProcessSchedulersAllowed({ SCHEDULERS: "on", VERCEL: "1" }), false, "Vercel: the hourly cron tick covers the jobs");
  assert.equal(inProcessSchedulersAllowed({ SCHEDULERS: "on", VERCEL: "" }), true, "empty VERCEL is not Vercel");
  assert.equal(inProcessSchedulersAllowed({}), false);
  assert.equal(inProcessSchedulersAllowed({ SCHEDULERS: "off" }), false);
});
