import assert from "node:assert/strict";
import { test } from "node:test";

import { currentStepKey } from "./employer-flow-steps.ts";

test("each strip page lights its own step", () => {
  assert.equal(currentStepKey("candidates"), "candidates");
  assert.equal(currentStepKey("cart"), "shortlisted");
  assert.equal(currentStepKey("proposals"), "awaitingReply");
  assert.equal(currentStepKey("checkout"), "toPay");
});

test("no page lights no step", () => {
  assert.equal(currentStepKey(null), null);
});
