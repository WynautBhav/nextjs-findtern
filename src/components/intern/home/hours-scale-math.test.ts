import assert from "node:assert/strict";
import { test } from "node:test";

import { niceMax } from "./hours-scale-math.ts";

test("the scale top is a round number at or above the tallest month", () => {
  assert.equal(niceMax(0), 40);
  assert.equal(niceMax(18), 40);
  assert.equal(niceMax(155), 160);
  assert.equal(niceMax(160), 160);
  assert.equal(niceMax(1234), 1400);
});
