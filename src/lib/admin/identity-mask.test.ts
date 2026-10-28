import test from "node:test";
import assert from "node:assert/strict";

import { identityValue, maskTail, redactIdentity } from "./identity-mask.ts";

const row = {
  aadhaarNumber: "234567890123",
  panNumber: "ABCDE1234F",
  extraData: { bankDetails: { accountNumber: "001122334455", ifscCode: "HDFC0000001" }, panNumber: "ABCDE1234F", other: 1 },
};

test("maskTail keeps the last four only", () => {
  assert.equal(maskTail("2345 6789 0123"), "•••• 0123");
  assert.equal(maskTail("ABCDE1234F"), "•••• 234F");
  assert.equal(maskTail("123"), "••••");
  assert.equal(maskTail(""), "");
  assert.equal(maskTail(null), "");
});

test("redactIdentity leaves no full number anywhere in the row", () => {
  const safe = redactIdentity(row);
  const json = JSON.stringify(safe);
  for (const full of ["234567890123", "ABCDE1234F", "001122334455"]) assert.ok(!json.includes(full), full);
  assert.equal(safe.aadhaarNumber, "•••• 0123");
  assert.equal((safe.extraData as { bankDetails: { ifscCode: string } }).bankDetails.ifscCode, "HDFC0000001");
  assert.equal((safe.extraData as { other: number }).other, 1);
  // The source row is not mutated.
  assert.equal(row.extraData.bankDetails.accountNumber, "001122334455");
});

test("identityValue reads the full value, column first, then extra data", () => {
  assert.equal(identityValue(row, "aadhaar"), "234567890123");
  assert.equal(identityValue({ aadhaarNumber: null, panNumber: null, extraData: { panNumber: "ZZZZZ9999Z" } }, "pan"), "ZZZZZ9999Z");
  assert.equal(identityValue({ extraData: { bank: { accountNumber: "99887766" } } }, "bank"), "99887766");
  assert.equal(identityValue(null, "pan"), "");
});
