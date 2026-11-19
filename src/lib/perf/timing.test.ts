import assert from "node:assert/strict";
import { test } from "node:test";

import { instrumentPool, newScope, perfEnabled, perfLine, perfScope, recordAcquire, recordQuery, shortSql } from "./timing.ts";

test("perfEnabled only for PERF_LOG=1", () => {
  assert.equal(perfEnabled({ PERF_LOG: "1" }), true);
  assert.equal(perfEnabled({ PERF_LOG: "true" }), false);
  assert.equal(perfEnabled({}), false);
});

test("shortSql: one line, 80 characters", () => {
  assert.equal(shortSql("select  a\n  from b"), "select a from b");
  assert.equal(shortSql("x".repeat(200)).length, 80);
  assert.equal(shortSql(undefined), "");
});

test("a scope sums queries, keeps the slowest and counts new sockets", () => {
  const s = newScope("employer/proposals", 100);
  recordQuery(s, 10.4, "select 1");
  recordQuery(s, 250.6, "select * from proposals where employer_id = $1");
  recordQuery(s, 5, "select 3");
  recordAcquire(s, 3, false);
  recordAcquire(s, 400, true);
  const line = JSON.parse(perfLine(s, 600));
  assert.deepEqual(line, {
    perf: "employer/proposals",
    totalMs: 500,
    queries: 3,
    queryMs: 266,
    maxQueryMs: 251,
    slowest: "select * from proposals where employer_id = $1",
    acquires: 2,
    acquireMs: 403,
    maxAcquireMs: 400,
    newConns: 1,
  });
});

test("perfScope is a pass-through when PERF_LOG is not set", async () => {
  const before = process.env.PERF_LOG;
  delete process.env.PERF_LOG;
  try {
    assert.equal(await perfScope("x", async () => 7), 7);
    await assert.rejects(perfScope("x", async () => { throw new Error("boom"); }), /boom/);
  } finally {
    if (before !== undefined) process.env.PERF_LOG = before;
  }
});

test("instrumentPool times queries inside a scope and leaves the result untouched", async () => {
  const before = process.env.PERF_LOG;
  process.env.PERF_LOG = "1";
  const lines: string[] = [];
  const log = console.log;
  console.log = (m: unknown) => void lines.push(String(m));
  try {
    const pool = {
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      query: async (...a: unknown[]) => ({ rows: [a.length] }), // one argument in, so [1]
      connect: async () => {
        pool.totalCount += 1; // a new socket
        return { release() {} };
      },
    };
    instrumentPool(pool);
    const out = await perfScope("t", async () => {
      await pool.connect();
      return pool.query({ text: "select  1" });
    });
    assert.deepEqual(out, { rows: [1] });
    const line = JSON.parse(lines.find((l) => l.includes('"perf":"t"')) as string);
    assert.equal(line.queries, 1);
    assert.equal(line.slowest, "select 1");
    assert.equal(line.acquires, 1);
    assert.equal(line.newConns, 1);
  } finally {
    console.log = log;
    if (before === undefined) delete process.env.PERF_LOG;
    else process.env.PERF_LOG = before;
  }
});
