import assert from "node:assert/strict";
import { test } from "node:test";

import { payoutKindLabel } from "./payout-kind.ts";

test("payoutKindLabel names both kinds; unknown or missing reads as a stipend", () => {
  assert.equal(payoutKindLabel("stipend"), "Stipend");
  assert.equal(payoutKindLabel("completion_bonus"), "Completion bonus");
  assert.equal(payoutKindLabel(null), "Stipend");
  assert.equal(payoutKindLabel(undefined), "Stipend");
});
