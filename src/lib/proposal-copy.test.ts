import test from "node:test";
import assert from "node:assert/strict";

import { learnField, learnIssue, LEARN_MIN, LEARN_MAX, LEARN_REQUIRED_MESSAGE } from "./proposal-copy.ts";

test("what the intern will learn is mandatory: missing, blank and whitespace are refused", () => {
  assert.equal(learnIssue(undefined), LEARN_REQUIRED_MESSAGE);
  assert.equal(learnIssue(null), LEARN_REQUIRED_MESSAGE);
  assert.equal(learnIssue(""), LEARN_REQUIRED_MESSAGE);
  assert.equal(learnIssue("   \n\t "), LEARN_REQUIRED_MESSAGE);
});

test("a stub shorter than the minimum is refused, the minimum itself passes", () => {
  assert.notEqual(learnIssue("x".repeat(LEARN_MIN - 1)), null);
  assert.equal(learnIssue("x".repeat(LEARN_MIN)), null);
  assert.equal(learnIssue(`  ${"x".repeat(LEARN_MIN)}  `), null);
});

test("an over-long answer is refused", () => {
  assert.equal(learnIssue("x".repeat(LEARN_MAX)), null);
  assert.notEqual(learnIssue("x".repeat(LEARN_MAX + 1)), null);
});

test("the API field rejects a missing or blank value and trims a good one", () => {
  const missing = learnField.safeParse(undefined);
  assert.equal(missing.success, false);
  assert.equal(missing.error?.issues[0]?.message, LEARN_REQUIRED_MESSAGE);
  assert.equal(learnField.safeParse("   ").success, false);
  const ok = learnField.safeParse("  Shipping a feature with code review.  ");
  assert.equal(ok.success, true);
  assert.equal(ok.data, "Shipping a feature with code review.");
});
