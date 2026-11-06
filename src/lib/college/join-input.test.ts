import assert from "node:assert/strict";
import { test } from "node:test";

import { branchProblem } from "./join-input.ts";

test("branchProblem rejects blank, null and over-long branches", () => {
  assert.equal(branchProblem(""), "Enter your branch");
  assert.equal(branchProblem("   "), "Enter your branch");
  assert.equal(branchProblem(null), "Enter your branch");
  assert.equal(branchProblem("x".repeat(121)), "Enter your branch");
});

test("branchProblem accepts a normal branch", () => {
  assert.equal(branchProblem("CSE"), null);
  assert.equal(branchProblem("  ECE  "), null);
  assert.equal(branchProblem("x".repeat(120)), null);
});
