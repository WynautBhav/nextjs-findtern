import { test } from "node:test";
import assert from "node:assert/strict";

const { makeGate } = await import("./request-gate.ts");

function probe() {
  let running = 0;
  let peak = 0;
  const started: number[] = [];
  const job = (id: number, ms = 10, fail = false) => async () => {
    started.push(id);
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, ms));
    running--;
    if (fail) throw new Error(`job ${id} failed`);
    return id;
  };
  return { job, started, peak: () => peak };
}

test("never runs more than the limit at once, and still overlaps up to the limit", async () => {
  const gate = makeGate(5);
  const p = probe();
  const out = await Promise.all(Array.from({ length: 17 }, (_, i) => gate(p.job(i))));
  assert.deepEqual(out, Array.from({ length: 17 }, (_, i) => i), "results come back in call order");
  assert.equal(p.peak(), 5);
});

test("is not serial: 10 jobs of 20 ms through a gate of 5 take about two rounds, not ten", async () => {
  const gate = makeGate(5);
  const p = probe();
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 10 }, (_, i) => gate(p.job(i, 20))));
  assert.ok(Date.now() - t0 < 100, `took ${Date.now() - t0} ms`);
});

test("starts work in the order it was asked for", async () => {
  const gate = makeGate(2);
  const p = probe();
  await Promise.all(Array.from({ length: 6 }, (_, i) => gate(p.job(i))));
  assert.deepEqual(p.started, [0, 1, 2, 3, 4, 5]);
});

test("a failing job gives its slot back and the others still run", async () => {
  const gate = makeGate(1);
  const p = probe();
  const results = await Promise.allSettled([gate(p.job(0, 5, true)), gate(p.job(1)), gate(p.job(2))]);
  assert.deepEqual(results.map((r) => r.status), ["rejected", "fulfilled", "fulfilled"]);
  assert.equal(p.peak(), 1);
});

test("a job that throws synchronously also frees its slot", async () => {
  const gate = makeGate(1);
  await assert.rejects(gate(() => { throw new Error("boom"); }));
  assert.equal(await gate(async () => "next"), "next");
});
