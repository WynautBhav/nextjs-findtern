import test from "node:test";
import assert from "node:assert/strict";
import { PROGRESS_DELAY_MS, nextPercent, uploadPercent } from "./upload-progress.ts";

test("uploadPercent rounds down, so 100 means every byte is sent", () => {
  assert.equal(uploadPercent(0, 1000), 0);
  assert.equal(uploadPercent(1, 3), 33);
  assert.equal(uploadPercent(999, 1000), 99);
  assert.equal(uploadPercent(1000, 1000), 100);
});
test("uploadPercent clamps and refuses to guess", () => {
  assert.equal(uploadPercent(2000, 1000), 100);
  assert.equal(uploadPercent(-5, 1000), 0);
  assert.equal(uploadPercent(10, 0), null);
  assert.equal(uploadPercent(10, NaN), null);
  assert.equal(uploadPercent(NaN, 10), null);
});
test("nextPercent never goes backwards and ignores events without a total", () => {
  assert.equal(nextPercent(40, 10, 100), 40);
  assert.equal(nextPercent(40, 70, 100), 70);
  assert.equal(nextPercent(40, 5, 0), 40);
});
test("the bar waits about a second", () => {
  assert.equal(PROGRESS_DELAY_MS, 1000);
});
