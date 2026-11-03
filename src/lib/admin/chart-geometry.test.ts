import assert from "node:assert/strict";
import { test } from "node:test";

import {
  arcPath,
  gaugeArcs,
  gaugePoint,
  monotoneSegments,
  monotonePath,
  nearestIndex,
  niceTicks,
  segmentFractions,
  thinLabelIndices,
} from "./chart-geometry.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("gaugePoint runs left, top, right", () => {
  const l = gaugePoint(100, 100, 50, 0);
  const t = gaugePoint(100, 100, 50, 0.5);
  const r = gaugePoint(100, 100, 50, 1);
  close(l.x, 50); close(l.y, 100);
  close(t.x, 100); close(t.y, 50);
  close(r.x, 150); close(r.y, 100);
});

test("arcPath draws clockwise with large-arc off and clamps its fractions", () => {
  assert.equal(arcPath(100, 100, 50, 0, 1), "M50,100 A50,50 0 0 1 150,100");
  assert.equal(arcPath(100, 100, 50, -1, 2), arcPath(100, 100, 50, 0, 1));
  assert.equal(arcPath(100, 100, 50, 0.7, 0.2), arcPath(100, 100, 50, 0.7, 0.7));
});

test("segment fractions sum to exactly 1", () => {
  for (const values of [[1, 2, 3], [41, 33, 26], [0.1, 0.2, 0.7], [5], [1, 0, 1]]) {
    const f = segmentFractions(values);
    assert.equal(f.reduce((a, b) => a + b, 0), 1);
    assert.ok(f.every((x) => x >= 0 && x <= 1));
  }
});

test("all-zero, negative and NaN totals give an empty gauge", () => {
  assert.deepEqual(segmentFractions([0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(segmentFractions([-3, Number.NaN]), [0, 0]);
  assert.deepEqual(segmentFractions([]), []);
  assert.deepEqual(segmentFractions([-1, 4]), [0, 1]);
});

test("gaugeArcs trims gaps only between neighbours and skips zero segments", () => {
  const arcs = gaugeArcs([0.5, 0, 0.5], 0.02);
  assert.deepEqual(arcs[0], { start: 0, end: 0.48 });
  assert.equal(arcs[1], null);
  assert.deepEqual(arcs[2], { start: 0.52, end: 1 });
  assert.deepEqual(gaugeArcs([1], 0.05), [{ start: 0, end: 1 }]);
});

test("gaugeArcs collapses a segment thinner than its gaps to a dot", () => {
  const arcs = gaugeArcs([0.49, 0.01, 0.5], 0.03);
  const dot = arcs[1];
  assert.ok(dot && dot.end > dot.start && dot.end - dot.start < 0.001);
  assert.ok(dot.start >= 0.49 && dot.end <= 0.5 + 0.001);
});

test("niceTicks starts at 0, is ascending, evenly stepped and covers max", () => {
  for (const max of [0.7, 1, 7, 12, 37, 99, 100, 480, 1234, 98765]) {
    for (const count of [3, 4, 5]) {
      const t = niceTicks(max, count);
      assert.equal(t[0], 0);
      assert.ok(t[t.length - 1] >= max, `max ${max}`);
      assert.ok(t.length >= 2 && t.length <= count + 2, `${max}/${count}: ${t.join()}`);
      const step = t[1] - t[0];
      t.forEach((v, i) => i && close(v - t[i - 1], step, 1e-6));
    }
  }
  assert.deepEqual(niceTicks(100, 4), [0, 25, 50, 75, 100]);
  assert.deepEqual(niceTicks(12, 4), [0, 5, 10, 15]);
});

test("niceTicks survives zero and nonsense maxima", () => {
  assert.deepEqual(niceTicks(0, 4), [0, 0.25, 0.5, 0.75, 1]);
  assert.ok(niceTicks(Number.NaN, 4).length >= 2);
  assert.ok(niceTicks(-5, 4).length >= 2);
});

test("thinLabelIndices keeps labels apart and keeps the first", () => {
  assert.deepEqual(thinLabelIndices(7, 60, 40), [0, 1, 2, 3, 4, 5, 6]);
  const idx = thinLabelIndices(30, 20, 50);
  assert.equal(idx[0], 0);
  idx.forEach((v, i) => i && assert.ok((v - idx[i - 1]) * 20 >= 50));
  assert.deepEqual(thinLabelIndices(0, 20, 50), []);
});

const sample = [
  { x: 0, y: 10 }, { x: 10, y: 40 }, { x: 20, y: 40 }, { x: 30, y: 5 },
  { x: 45, y: 6 }, { x: 60, y: 90 }, { x: 70, y: 0 },
];

function bezier(p0: number, p1: number, p2: number, p3: number, t: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

test("monotone curve passes through every point", () => {
  const segs = monotoneSegments(sample);
  assert.equal(segs.length, sample.length - 1);
  segs.forEach((s, i) => {
    assert.deepEqual(s.to, sample[i + 1]);
  });
  assert.ok(monotonePath(sample).startsWith("M0,10 C"));
  assert.equal((monotonePath(sample).match(/C/g) ?? []).length, sample.length - 1);
});

test("monotone curve never overshoots between two points", () => {
  const segs = monotoneSegments(sample);
  segs.forEach((s, i) => {
    const p0 = sample[i];
    const lo = Math.min(p0.y, s.to.y) - 1e-9;
    const hi = Math.max(p0.y, s.to.y) + 1e-9;
    for (let k = 0; k <= 50; k++) {
      const y = bezier(p0.y, s.c1.y, s.c2.y, s.to.y, k / 50);
      assert.ok(y >= lo && y <= hi, `segment ${i} t=${k / 50}: ${y}`);
      const x = bezier(p0.x, s.c1.x, s.c2.x, s.to.x, k / 50);
      assert.ok(x >= p0.x - 1e-9 && x <= s.to.x + 1e-9);
    }
  });
});

test("monotone curve is flat across flat runs and handles tiny inputs", () => {
  const segs = monotoneSegments([{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }]);
  segs.forEach((s) => assert.ok(s.c1.y === 5 && s.c2.y === 5));
  assert.deepEqual(monotoneSegments([{ x: 0, y: 1 }]), []);
  assert.equal(monotonePath([]), "");
  assert.equal(monotonePath([{ x: 3, y: 4 }]), "M3,4");
});

test("nearestIndex snaps to the closest x", () => {
  assert.equal(nearestIndex([0, 10, 20], 4), 0);
  assert.equal(nearestIndex([0, 10, 20], 16), 2);
  assert.equal(nearestIndex([], 5), -1);
});
