import assert from "node:assert/strict";
import test from "node:test";

import { formatCollegeCode, isCollegeCodeComplete } from "./college-code-format.ts";

test("forgiving formatting", () => {
  assert.equal(formatCollegeCode("abcd efgh-jkmn"), "ABCD-EFGH-JKMN");
  assert.equal(formatCollegeCode("  ab "), "AB");
  assert.equal(formatCollegeCode("abcdefghjkmnxxxx"), "ABCD-EFGH-JKMN");
  assert.equal(isCollegeCodeComplete("abcd efgh jkmn"), true);
  assert.equal(isCollegeCodeComplete("abcd"), false);
});
