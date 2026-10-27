import { test } from "node:test";
import assert from "node:assert/strict";

import { rawScore } from "./employer-candidates.ts";

// EMB-02: legacy stored findternScore as a number or a numeric string and
// read it with Number(); the new pool must agree on who is scored.
test("rawScore reads numbers and numeric strings", () => {
  assert.equal(rawScore({ findternScore: 7.4 }), 7.4);
  assert.equal(rawScore({ findternScore: "6.25" }), 6.25);
  assert.equal(rawScore({ findternScore: " 8 " }), 8);
  assert.equal(rawScore({ findternScore: 0 }), 0);
});

test("rawScore treats anything else as not scored", () => {
  assert.equal(rawScore({}), null);
  assert.equal(rawScore({ findternScore: "" }), null);
  assert.equal(rawScore({ findternScore: "n/a" }), null);
  assert.equal(rawScore({ findternScore: null }), null);
  assert.equal(rawScore({ findternScore: Number.NaN }), null);
});
