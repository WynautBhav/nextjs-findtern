import assert from "node:assert/strict";
import test from "node:test";

import { drainNowIfQueued, rowsToDrain, shouldDrainNow } from "./drain-now.ts";

test("shouldDrainNow: SCHEDULERS=off and OUTBOX_CRON=off skip; default and other values drain", () => {
  assert.equal(shouldDrainNow({}), true);
  assert.equal(shouldDrainNow({ SCHEDULERS: "on", OUTBOX_CRON: "on" }), true);
  assert.equal(shouldDrainNow({ SCHEDULERS: "off" }), false);
  assert.equal(shouldDrainNow({ OUTBOX_CRON: "off" }), false);
  assert.equal(shouldDrainNow({ OUTBOX_CRON: " OFF " }), false);
  assert.equal(shouldDrainNow({ SCHEDULERS: "off", OUTBOX_CRON: "off" }), false);
});

function harness(env: Record<string, string | undefined> = {}, drain?: () => Promise<unknown>) {
  const calls = { scheduled: 0, drained: [] as unknown[], logs: [] as unknown[][] };
  const deps = {
    env,
    schedule: (fn: () => Promise<void>) => { calls.scheduled += 1; return fn(); },
    drain: async (o: { budgetMs: number }) => { calls.drained.push(o); if (drain) await drain(); },
    log: (...a: unknown[]) => { calls.logs.push(a); },
  };
  return { calls, deps };
}

test("drainNowIfQueued: drains once with a 20 s budget when rows were queued", async () => {
  const { calls, deps } = harness();
  assert.equal(drainNowIfQueued(2, deps), true);
  await Promise.resolve();
  assert.equal(calls.scheduled, 1);
  assert.deepEqual(calls.drained, [{ budgetMs: 20_000 }]);
});

test("drainNowIfQueued: nothing scheduled when 0 queued or a kill switch is on", () => {
  for (const [n, env] of [[0, {}], [-1, {}], [3, { SCHEDULERS: "off" }], [3, { OUTBOX_CRON: "off" }]] as const) {
    const { calls, deps } = harness(env);
    assert.equal(drainNowIfQueued(n, deps), false);
    assert.equal(calls.scheduled, 0);
    assert.equal(calls.drained.length, 0);
  }
});

test("drainNowIfQueued: a drain error is logged redacted and never thrown; address and code not logged", async () => {
  const { calls, deps } = harness({}, async () => { throw new Error("boom to jane.doe@college.edu code ABCD-1234"); });
  assert.doesNotThrow(() => drainNowIfQueued(1, deps));
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.logs.length, 1);
  assert.doesNotMatch(JSON.stringify(calls.logs), /jane\.doe@college\.edu/);
});

test("drainNowIfQueued: a throwing scheduler (outside a request) is caught", () => {
  const { calls, deps } = harness();
  deps.schedule = () => { throw new Error("outside request scope"); };
  assert.equal(drainNowIfQueued(1, deps), false);
  assert.equal(calls.logs.length, 1);
});

test("send decision: drains when rows are already queued even if nothing new was queued; not when both are 0; kill switches still win", () => {
  const run = (newly: number, pending: number, env: Record<string, string | undefined> = {}) => {
    const { calls, deps } = harness(env);
    return { started: drainNowIfQueued(rowsToDrain(newly, pending), deps), calls };
  };
  assert.equal(run(0, 2).started, true);
  assert.equal(run(0, 2).calls.drained.length, 1);
  assert.equal(run(3, 3).started, true);
  assert.equal(run(2, 0).started, true);
  assert.equal(run(0, 0).started, false);
  assert.equal(run(0, 0).calls.scheduled, 0);
  assert.equal(run(0, 2, { SCHEDULERS: "off" }).started, false);
  assert.equal(run(0, 2, { OUTBOX_CRON: "off" }).started, false);
  assert.equal(rowsToDrain(0, 0), 0);
});
