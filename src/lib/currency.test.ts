import test from "node:test";
import assert from "node:assert/strict";

import { inrMinorToUsdMinor, inrToUsd, savingsPercent } from "./currency.ts";

test("₹100 = $1, flat", () => {
  assert.equal(inrMinorToUsdMinor(10000), 100);
  assert.equal(inrMinorToUsdMinor(20000), 200);
  assert.equal(inrMinorToUsdMinor(500000), 5000);
  assert.equal(inrToUsd(50000), 500);
});

test("savings percent", () => {
  assert.equal(savingsPercent(10000, 15000), 33);
  assert.equal(savingsPercent(0, 750000), 100);
  assert.equal(savingsPercent(10000, null), null);
  assert.equal(savingsPercent(10000, 10000), null);
  assert.equal(savingsPercent(10000, 5000), null);
});
