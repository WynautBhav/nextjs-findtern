import assert from "node:assert/strict";
import { test } from "node:test";

import { markPaidProblem } from "./mark-paid-rules.ts";

const fee = 249900;

test("the standard fee needs no reason", () => {
  assert.equal(markPaidProblem({ role: "intern", amountMinor: fee, feeMinor: fee }), null);
});

test("₹0 and negative amounts are refused, with or without a reason", () => {
  assert.match(markPaidProblem({ role: "intern", amountMinor: 0, feeMinor: fee, reason: "waived by sales" }) ?? "", /more than ₹0/);
  assert.ok(markPaidProblem({ role: "intern", amountMinor: -100, feeMinor: fee }));
  assert.ok(markPaidProblem({ role: "intern", amountMinor: Number.NaN, feeMinor: fee }));
});

test("a different amount needs a reason of 5+ characters", () => {
  assert.match(markPaidProblem({ role: "intern", amountMinor: 100000, feeMinor: fee }) ?? "", /reason/);
  assert.match(markPaidProblem({ role: "intern", amountMinor: 100000, feeMinor: fee, reason: " ok " }) ?? "", /reason/);
  assert.equal(markPaidProblem({ role: "intern", amountMinor: 100000, feeMinor: fee, reason: "Part payment by cheque" }), null);
});

test("only an intern account", () => {
  assert.ok(markPaidProblem({ role: "employer", amountMinor: fee, feeMinor: fee }));
  assert.ok(markPaidProblem({ role: null, amountMinor: fee, feeMinor: fee }));
});
