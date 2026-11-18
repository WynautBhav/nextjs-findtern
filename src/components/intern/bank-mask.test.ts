import assert from "node:assert/strict";
import { test } from "node:test";

import { accountLast4, bankOnFileOf, maskAccount } from "./bank-mask.ts";

const FULL = "001234567890";

test("an account number is masked to its last four digits", () => {
  assert.equal(maskAccount(FULL), "•••• 7890");
  assert.equal(maskAccount("0012 3456 7890"), "•••• 7890");
  assert.equal(maskAccount(""), "");
  assert.equal(accountLast4("ab-12"), "12");
});

test("what is read from the onboarding row never carries the full number", () => {
  for (const key of ["bankDetails", "bank"]) {
    const onFile = bankOnFileOf({ [key]: { bankName: " HDFC Bank ", accountHolderName: "Sana Kapoor", accountNumber: FULL, ifscCode: "HDFC0001234" } });
    assert.equal(onFile.accountLast4, "7890");
    assert.equal(onFile.bankName, "HDFC Bank");
    assert.equal(onFile.ifscCode, "HDFC0001234");
    const wire = JSON.stringify(onFile);
    assert.ok(!wire.includes(FULL) && !wire.includes("123456"), "full number must not be in the payload");
    assert.ok(!("accountNumber" in onFile));
  }
});

test("no bank on file reads as empty", () => {
  assert.deepEqual(bankOnFileOf(null), { bankName: "", accountHolderName: "", accountLast4: "", ifscCode: "", upiId: "" });
});
