import assert from "node:assert/strict";
import { test } from "node:test";

import { fillSeries, growth } from "./growth.ts";

test("growth: percent change, rounded, with a real minus sign", () => {
  assert.deepEqual(growth(12, 10), { pct: 20, kind: "up", label: "+20%" });
  assert.deepEqual(growth(7, 10), { pct: -30, kind: "down", label: "\u221230%" });
  assert.deepEqual(growth(10, 10), { pct: 0, kind: "flat", label: "0%" });
});

test("growth: a zero baseline is 'New', never infinity or NaN", () => {
  assert.deepEqual(growth(5, 0), { pct: null, kind: "new", label: "New" });
  assert.deepEqual(growth(0, 0), { pct: 0, kind: "flat", label: "0%" });
});

test("growth: nothing to compare with (all time) gives no delta", () => {
  assert.deepEqual(growth(5, null), { pct: null, kind: "none", label: "" });
  assert.deepEqual(growth(Number.NaN, 3), { pct: null, kind: "none", label: "" });
});

test("growth: dropping to zero is -100%", () => {
  assert.deepEqual(growth(0, 4), { pct: -100, kind: "down", label: "\u2212100%" });
});

test("fillSeries: zero-fills every bucket and ignores keys outside the range", () => {
  const out = fillSeries(["2026-11-01", "2026-11-08", "2026-11-15"], [{ key: "2026-11-08", n: 3 }, { key: "2020-01-01", n: 9 }], (r) => r.n);
  assert.deepEqual(out, [0, 3, 0]);
});

test("fillSeries: two rows in one bucket are added", () => {
  assert.deepEqual(fillSeries(["a"], [{ key: "a", n: 1 }, { key: "a", n: 2 }], (r) => r.n), [3]);
});
