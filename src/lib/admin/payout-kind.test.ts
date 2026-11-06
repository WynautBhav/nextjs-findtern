import assert from "node:assert/strict";
import { test } from "node:test";

import { payoutKindLabel } from "./payout-kind.ts";

test("payoutKindLabel names both kinds; unknown or missing reads as a stipend", () => {
  assert.equal(payoutKindLabel("stipend"), "Stipend");
  assert.equal(payoutKindLabel("completion_bonus"), "Completion bonus");
  assert.equal(payoutKindLabel(null), "Stipend");
  assert.equal(payoutKindLabel(undefined), "Stipend");
});

test("canPayOut: no bank details on file blocks, complete details (current or legacy key) pass", async () => {
  const { canPayOut } = await import("./payout-kind.ts");
  const bank = { accountHolderName: "Asha Rao", bankName: "SBI", accountNumber: "123456789012", ifscCode: "SBIN0001234", upiId: "" };
  assert.deepEqual(canPayOut({}), { ok: false, error: "Intern has no bank details on file" });
  assert.deepEqual(canPayOut(null), { ok: false, error: "Intern has no bank details on file" });
  assert.deepEqual(canPayOut({ bankDetails: { accountHolderName: "", accountNumber: "" } }), { ok: false, error: "Intern has no bank details on file" });
  assert.deepEqual(canPayOut({ bankDetails: bank }), { ok: true });
  assert.deepEqual(canPayOut({ bank }), { ok: true }, "legacy bank key");
  const partial = canPayOut({ bankDetails: { ...bank, ifscCode: "BAD" } });
  assert.equal(partial.ok, false);
});
