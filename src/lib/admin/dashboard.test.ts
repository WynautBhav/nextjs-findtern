import { test } from "node:test";
import assert from "node:assert/strict";

import { attentionTotal, funnelSteps } from "./dashboard.ts";

test("attentionTotal sums counts and caps fresh at each count", () => {
  assert.deepEqual(attentionTotal([{ count: 3, fresh: 1 }, { count: 2, fresh: 5 }, { count: 4 }]), { total: 9, fresh: 3 });
  assert.deepEqual(attentionTotal([]), { total: 0, fresh: 0 });
});

test("funnelSteps is monotone and rates are step-over-step", () => {
  const steps = funnelSteps(["View", "Shortlist", "Interview", "Offer", "Hire"], [
    { stage: 1, value: 50 },
    { stage: 2, value: 20 },
    { stage: 3, value: 10 },
    { stage: 5, value: 5 },
  ]);
  assert.deepEqual(steps.map((s) => s.reached), [85, 35, 15, 5, 5]);
  assert.deepEqual(steps.map((s) => s.rate), [null, 41, 43, 33, 100]);
});

test("funnelSteps ignores out-of-range stages and handles an empty top", () => {
  const steps = funnelSteps(["A", "B"], [{ stage: 9, value: 4 }, { stage: 0, value: 4 }]);
  assert.deepEqual(steps, [
    { label: "A", reached: 0, rate: null },
    { label: "B", reached: 0, rate: null },
  ]);
});
