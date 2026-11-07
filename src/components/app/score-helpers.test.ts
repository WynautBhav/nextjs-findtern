import test from "node:test";
import assert from "node:assert/strict";
import { scoreLabel, scoreA11y } from "./score-helpers.ts";

test("scoreLabel", () => {
  assert.equal(scoreLabel(8.84), "8.8 · Assured");
  assert.equal(scoreLabel(6), "6.0 · Skilled");
  assert.equal(scoreLabel(5.99), "6.0 · Standard");
  assert.equal(scoreLabel(-1), "0.0 · Standard");
  assert.equal(scoreLabel(12), "10.0 · Assured");
});
test("scoreA11y", () => {
  assert.equal(scoreA11y(8.8), "Findtern score 8.8 out of 10, Assured band");
});

import { scoreParts } from "./score-helpers.ts";
test("scoreParts", () => {
  assert.deepEqual(scoreParts(8.84), { value: "8.8", band: "Assured" });
  assert.deepEqual(scoreParts(99), { value: "10.0", band: "Assured" });
});
