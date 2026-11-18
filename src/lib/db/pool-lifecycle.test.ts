import assert from "node:assert/strict";
import { test } from "node:test";

import { CONNECT_TIMEOUT_MS, holdUntilIdle, idleTimeoutMs, isPlainSelect, retryable, vercelWaitUntil, withRetry, type RetryablePool } from "./pool-lifecycle.ts";

test("pool options: short idle on Vercel, 5 s connect timeout", () => {
  assert.equal(idleTimeoutMs({ VERCEL: "1" }), 5_000);
  assert.equal(idleTimeoutMs({}), 15_000);
  assert.equal(CONNECT_TIMEOUT_MS, 5_000);
});

test("isPlainSelect: reads only, no locking reads, no CTE writes", () => {
  assert.equal(isPlainSelect('select "id" from "users" where "id" = $1'), true);
  assert.equal(isPlainSelect("  SELECT 1"), true);
  assert.equal(isPlainSelect("select * from t for update"), false);
  assert.equal(isPlainSelect("with x as (insert into t values (1) returning *) select * from x"), false);
  assert.equal(isPlainSelect('insert into "t" values ($1)'), false);
  assert.equal(isPlainSelect("update t set a = 1"), false);
});

test("retryable: connect timeouts for any statement, lost sockets only for a plain select", () => {
  const timeout = new Error("Connection terminated due to connection timeout");
  const queue = new Error("timeout exceeded when trying to connect");
  const lost = new Error("Connection terminated unexpectedly");
  assert.equal(retryable(timeout, "insert into t values (1)"), true);
  assert.equal(retryable(queue, "update t set a=1"), true);
  assert.equal(retryable(lost, "select 1"), true);
  assert.equal(retryable(lost, "insert into t values (1)"), false, "may have run before the socket died");
  assert.equal(retryable(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }), "select 1"), true);
  assert.equal(retryable(new Error('relation "x" does not exist'), "select 1"), false);
  assert.equal(retryable(null, undefined), false);
});

function fakePool(failures: Error[]) {
  const calls = { query: 0, connect: 0 };
  const pool: RetryablePool = {
    async query() {
      calls.query++;
      const f = failures.shift();
      if (f) throw f;
      return { rows: [1] };
    },
    async connect() {
      calls.connect++;
      const f = failures.shift();
      if (f) throw f;
      return { client: true };
    },
  };
  return { pool, calls };
}
const noWait = async () => undefined;

test("withRetry: one retry on a connect timeout, then success", async () => {
  const { pool, calls } = fakePool([new Error("Connection terminated due to connection timeout")]);
  withRetry(pool, noWait);
  assert.deepEqual(await pool.query({ text: "insert into t values (1)" }), { rows: [1] });
  assert.equal(calls.query, 2);
});

test("withRetry: never more than one retry", async () => {
  const e = () => new Error("Connection terminated due to connection timeout");
  const { pool, calls } = fakePool([e(), e(), e()]);
  withRetry(pool, noWait);
  await assert.rejects(pool.query("select 1"), /connection timeout/);
  assert.equal(calls.query, 2);
});

test("withRetry: a lost socket repeats a select but not an insert; other errors never retry", async () => {
  const lost = () => new Error("Connection terminated unexpectedly");
  const a = fakePool([lost()]);
  withRetry(a.pool, noWait);
  await a.pool.query("select 1");
  assert.equal(a.calls.query, 2);
  const b = fakePool([lost()]);
  withRetry(b.pool, noWait);
  await assert.rejects(b.pool.query("insert into t values (1)"), /unexpectedly/);
  assert.equal(b.calls.query, 1);
  const c = fakePool([new Error("syntax error")]);
  withRetry(c.pool, noWait);
  await assert.rejects(c.pool.query("select 1"), /syntax/);
  assert.equal(c.calls.query, 1);
});

test("withRetry: connect() retries a connect timeout only; callback forms pass through untouched", async () => {
  const a = fakePool([new Error("timeout exceeded when trying to connect")]);
  withRetry(a.pool, noWait);
  assert.deepEqual(await a.pool.connect(), { client: true });
  assert.equal(a.calls.connect, 2);
  const b = fakePool([new Error("Connection terminated unexpectedly")]);
  withRetry(b.pool, noWait);
  await assert.rejects(b.pool.connect(), /unexpectedly/);
  assert.equal(b.calls.connect, 1);
  const c = fakePool([new Error("Connection terminated due to connection timeout")]);
  withRetry(c.pool, noWait);
  await assert.rejects(c.pool.query("select 1", () => undefined), /connection timeout/, "callback form is not wrapped");
  assert.equal(c.calls.query, 1);
});

test("holdUntilIdle: one pending hold per pool, released after idle + 100 ms; no-op without waitUntil", () => {
  const listeners: (() => void)[] = [];
  const pool = { on: (_e: "release", fn: () => void) => void listeners.push(fn) };
  const held: Promise<unknown>[] = [];
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const fakeTimers = {
    set: ((fn: () => void, ms: number) => (timers.push({ fn, ms, cleared: false }), timers.length - 1)) as unknown as typeof setTimeout,
    clear: ((id: number) => void (timers[id].cleared = true)) as unknown as typeof clearTimeout,
  };
  holdUntilIdle(pool, 5_000, () => (p) => void held.push(p), fakeTimers);
  listeners[0]();
  listeners[0]();
  assert.equal(held.length, 2);
  assert.equal(timers[0].cleared, true, "the earlier hold is replaced");
  assert.equal(timers[1].ms, 5_100);
  let resolved = false;
  held[1].then(() => (resolved = true));
  timers[1].fn();
  return Promise.resolve().then(() => assert.equal(resolved, true));
});

test("holdUntilIdle does nothing outside a Vercel request", () => {
  const listeners: (() => void)[] = [];
  holdUntilIdle({ on: (_e: "release", fn: () => void) => void listeners.push(fn) }, 5_000, () => undefined);
  listeners[0]();
  assert.equal(vercelWaitUntil({}), undefined);
  const sym = Symbol.for("@vercel/request-context");
  const wu = () => undefined;
  assert.equal(typeof vercelWaitUntil({ [sym]: { get: () => ({ waitUntil: wu }) } }), "function");
});
