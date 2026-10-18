import test from "node:test";
import assert from "node:assert/strict";

import { acceptanceRate, proposalOutcome } from "./proposals.ts";

test("hired and accepted are both wins", () => {
  assert.equal(proposalOutcome("accepted"), "won");
  assert.equal(proposalOutcome("hired"), "won");
});

test("rejected, withdrawn and expired are losses", () => {
  for (const s of ["rejected", "withdrawn", "expired"]) assert.equal(proposalOutcome(s), "lost");
});

test("everything else is still open", () => {
  for (const s of ["sent", "draft", "interview_scheduled", null, "something_new"]) {
    assert.equal(proposalOutcome(s), "open");
  }
});

test("acceptance rate is over decided proposals only", () => {
  assert.equal(acceptanceRate(0, 0), null);
  assert.equal(acceptanceRate(3, 1), 75);
  assert.equal(acceptanceRate(1, 2), 33);
});
