import { test } from "node:test";
import assert from "node:assert/strict";

import { isHiredProposal } from "./hire-status.ts";

test("a proposal is a hire by status or by hiredAt", () => {
  assert.equal(isHiredProposal({ status: "hired" }), true);
  assert.equal(isHiredProposal({ status: "accepted", hiredAt: new Date() }), true);
  assert.equal(isHiredProposal({ status: "accepted", hiredAt: null }), false);
  assert.equal(isHiredProposal({ status: "sent" }), false);
});
