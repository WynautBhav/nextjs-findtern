import assert from "node:assert/strict";
import { test } from "node:test";

import { companyInitials } from "./format.ts";

test("company initials: two letters, legal suffixes skipped", () => {
  assert.equal(companyInitials("Northwind Labs"), "NL");
  assert.equal(companyInitials("Acme"), "AC");
  assert.equal(companyInitials("Zeta Pvt. Ltd."), "ZE");
  assert.equal(companyInitials("The Hindu"), "HI");
  assert.equal(companyInitials("R&D Works"), "RD");
  assert.equal(companyInitials(""), "?");
  assert.equal(companyInitials(null), "?");
});
