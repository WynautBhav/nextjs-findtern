import assert from "node:assert/strict";
import test from "node:test";

import { pageWindow } from "./page-window.ts";

test("pageWindow: one page or none is just [1]", () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(1, 0), [1]);
});

test("pageWindow: 4 pages on page 1 shows 1 2 3 4, not 1 2 … 4 (B-17)", () => {
  assert.deepEqual(pageWindow(1, 4), [1, 2, 3, 4]);
  assert.deepEqual(pageWindow(4, 4), [1, 2, 3, 4]);
});

test("pageWindow: a gap that would hide a single page shows that page", () => {
  assert.deepEqual(pageWindow(2, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageWindow(4, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(pageWindow(3, 7), [1, 2, 3, 4, "gap", 7]);
  assert.deepEqual(pageWindow(5, 9), [1, "gap", 4, 5, 6, "gap", 9]);
});

test("pageWindow: a gap hiding two or more pages stays a gap", () => {
  assert.deepEqual(pageWindow(1, 6), [1, 2, "gap", 6]);
  assert.deepEqual(pageWindow(6, 88), [1, "gap", 5, 6, 7, "gap", 88]);
  assert.deepEqual(pageWindow(1, 88), [1, 2, "gap", 88]);
});

test("pageWindow: every page up to the end is reachable without a hidden single page", () => {
  for (let total = 1; total <= 30; total += 1) {
    for (let current = 1; current <= total; current += 1) {
      const out = pageWindow(current, total);
      const nums = out.filter((e): e is number => e !== "gap");
      assert.ok(nums.includes(1) && nums.includes(total) && nums.includes(current));
      out.forEach((entry, i) => {
        if (entry !== "gap") return;
        const before = out[i - 1] as number;
        const after = out[i + 1] as number;
        assert.ok(after - before > 2, `gap hides <2 pages at total=${total} current=${current}`);
      });
    }
  }
});
