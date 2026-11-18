import assert from "node:assert/strict";
import { test } from "node:test";

import { notificationsDue, runTick, tickResponse, type TickDeps, type TickResult } from "./cron-tick.ts";

const req = (auth?: string) => ({ headers: new Headers(auth ? { authorization: auth } : {}) });
const ok: TickResult = { reminders: "ok", notifications: "skipped", expiry: "ok", outbox: "ok" };

test("tick route: 401 without the secret, 401 for a wrong one, closed when CRON_SECRET is unset", async () => {
  let ran = 0;
  const run = async () => (ran++, ok);
  assert.equal((await tickResponse(req(), { secret: "s3cret", schedulers: "on", run })).status, 401);
  assert.equal((await tickResponse(req("Bearer nope"), { secret: "s3cret", schedulers: "on", run })).status, 401);
  assert.equal((await tickResponse(req("Bearer undefined"), { secret: undefined, schedulers: "on", run })).status, 401);
  assert.equal(ran, 0);
});

test("tick route: 200 with the secret and runs; SCHEDULERS=off skips without running", async () => {
  let ran = 0;
  const run = async () => (ran++, ok);
  const res = await tickResponse(req("Bearer s3cret"), { secret: "s3cret", schedulers: "on", run });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), ok);
  const off = await tickResponse(req("Bearer s3cret"), { secret: "s3cret", schedulers: "off", run });
  assert.equal(off.status, 200);
  assert.equal((await off.json()).skipped, true);
  assert.equal(ran, 1);
});

function deps(over: Partial<TickDeps> = {}, calls: string[] = []): TickDeps {
  return {
    reminders: async () => void calls.push("reminders"),
    notifications: async () => void calls.push("notifications"),
    expiry: async () => void calls.push("expiry"),
    outbox: async () => void calls.push("outbox"),
    outboxOff: false,
    now: new Date("2026-11-18T05:10:00Z"),
    ...over,
  };
}

test("notification jobs run on the ticks at UTC 00/06/12/18 only", () => {
  const at = (h: number) => notificationsDue(new Date(Date.UTC(2026, 10, 18, h, 10)));
  assert.deepEqual([0, 1, 5, 6, 7, 12, 18, 23].map(at), [true, false, false, true, false, true, true, false]);
});

test("tick runs every step it owns, and the same tick twice is just two runs of idempotent steps", async () => {
  const calls: string[] = [];
  const six = new Date("2026-11-18T06:10:00Z");
  assert.deepEqual(await runTick(deps({ now: six }, calls)), { reminders: "ok", notifications: "ok", expiry: "ok", outbox: "ok" });
  assert.deepEqual(calls, ["reminders", "expiry", "notifications", "outbox"]);
  const again = await runTick(deps({ now: six }, calls));
  assert.deepEqual(again, { reminders: "ok", notifications: "ok", expiry: "ok", outbox: "ok" });
  const off = await runTick(deps({ outboxOff: true }));
  assert.equal(off.outbox, "skipped");
  assert.equal(off.notifications, "skipped");
});

test("a failing step is reported and the others still run", async () => {
  const calls: string[] = [];
  const orig = console.error;
  console.error = () => undefined;
  try {
    const r = await runTick(deps({ reminders: async () => { throw new Error("db down"); } }, calls));
    assert.equal(r.reminders, "failed");
    assert.equal(r.expiry, "ok");
    assert.equal(r.outbox, "ok");
  } finally {
    console.error = orig;
  }
});

test("tick is bounded: no step starts after the budget is spent", async () => {
  let t = 0;
  const r = await runTick(deps({ budgetMs: 100, clock: () => t, reminders: async () => void (t += 150) }));
  assert.equal(r.reminders, "ok");
  assert.equal(r.expiry, "out-of-budget");
  assert.equal(r.outbox, "out-of-budget");
});
