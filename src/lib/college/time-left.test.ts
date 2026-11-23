import assert from "node:assert/strict";
import test from "node:test";

import { timeUntil } from "./time-left.ts";

const H = 3600_000;

test("FN-05: rounds down, so 12h55m reads 12 hours (the TPO list said 13)", () => {
  assert.equal(timeUntil(12 * H + 55 * 60_000), "12 hours");
  assert.equal(timeUntil(1 * H + 59 * 60_000), "1 hour");
  assert.equal(timeUntil(47 * H + 59 * 60_000), "47 hours");
});

test("days from 48 hours, minutes under an hour, null once passed", () => {
  assert.equal(timeUntil(48 * H), "2 days");
  assert.equal(timeUntil(71 * H), "2 days");
  assert.equal(timeUntil(45 * 60_000), "45 min");
  assert.equal(timeUntil(5_000), "1 min");
  assert.equal(timeUntil(0), null);
  assert.equal(timeUntil(-1), null);
});
