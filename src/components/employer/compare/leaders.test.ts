import assert from "node:assert/strict";
import { test } from "node:test";

import { isLevel, leaders } from "./leaders.ts";

const at = (values: number[], opts?: { lowerIsBetter?: boolean }) => [...leaders(values, opts)].sort();

test("one outright leader is marked", () => {
  assert.deepEqual(at([8, 9.1, 6.4]), [1]);
});

test("a tie at the top marks every tied candidate", () => {
  assert.deepEqual(at([9, 9, 7]), [0, 1]);
});

test("everyone level marks nobody", () => {
  assert.deepEqual(at([8, 8]), []);
  assert.deepEqual(at([5, 5, 5, 5]), []);
});

test("unrated (0) candidates neither lead nor count", () => {
  assert.deepEqual(at([7, 9, 0]), [1]);
  assert.deepEqual(at([9, 9, 0]), []);
});

test("a single rated candidate has nothing to beat", () => {
  assert.deepEqual(at([9, 0, 0]), []);
  assert.deepEqual(at([9]), []);
  assert.deepEqual(at([]), []);
});

test("values are compared as shown, to one decimal", () => {
  assert.deepEqual(at([7.04, 7.0, 6]), [0, 1]);
});

test("lowerIsBetter marks the cheapest, ignoring zeros", () => {
  assert.deepEqual(at([20000, 10000, 20000], { lowerIsBetter: true }), [1]);
  assert.deepEqual(at([20000, 0, 10000], { lowerIsBetter: true }), [2]);
  assert.deepEqual(at([500000, 500000], { lowerIsBetter: true }), []);
});

test("isLevel explains an unmarked row: two or more real values, all equal", () => {
  assert.equal(isLevel([8, 8]), true);
  assert.equal(isLevel([8, 8, 0]), true);
  assert.equal(isLevel([8, 9]), false);
  assert.equal(isLevel([9, 0]), false);
  assert.equal(isLevel([]), false);
});
