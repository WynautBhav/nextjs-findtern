import assert from "node:assert/strict";
import { test } from "node:test";

import { fitColumn, MIN_NODE } from "./sankey-fit.ts";

test("a 1 among 10 offers is raised to fit its label, the rest share what is left (Subodh: Rejected 1, Withdrawn 1 spilled; 23 Nov)", () => {
  const avail = 190;
  const { heights } = fitColumn([5, 3, 1, 1], avail);
  assert.equal(heights[2], MIN_NODE);
  assert.equal(heights[3], MIN_NODE);
  assert.ok(Math.abs(heights.reduce((a, h) => a + h, 0) - avail) < 1e-9, "the column still fills its space");
  assert.ok(heights[0] > heights[1] && heights[1] >= MIN_NODE, "larger values stay larger");
});

test("zeros stay zero and big-enough values stay proportional", () => {
  const { heights } = fitColumn([6, 4, 0, 0], 200);
  assert.deepEqual(heights, [120, 80, 0, 0]);
  assert.deepEqual(fitColumn([0, 0], 100).heights, [0, 0]);
});
