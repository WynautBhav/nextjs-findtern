import assert from "node:assert/strict";
import { test } from "node:test";

import { COLLEGE_CODE_PATTERN, generateCollegeCode, parseCollegeCode, withFreshCollegeCode } from "./code.ts";

test("generated codes are FT + 5 unambiguous characters", () => {
  for (let i = 0; i < 500; i++) assert.match(generateCollegeCode(), COLLEGE_CODE_PATTERN);
  assert.doesNotMatch("FT0O1IL", COLLEGE_CODE_PATTERN);
});

test("typed codes are cleaned; names and junk are not codes", () => {
  assert.equal(parseCollegeCode(" ft-7kq3m "), "FT7KQ3M");
  assert.equal(parseCollegeCode("FT7KQ3M"), "FT7KQ3M");
  assert.equal(parseCollegeCode("FT7KQ3"), null);
  assert.equal(parseCollegeCode("FT7KQ30"), null); // 0 is not in the alphabet
  assert.equal(parseCollegeCode("JK Lakshmipat"), null);
});

test("a clashing code is retried; other errors are not", async () => {
  let calls = 0;
  const ok = await withFreshCollegeCode(async (code) => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("dup"), { code: "23505", constraint: "colleges_code_unique" });
    return code;
  });
  assert.match(ok, COLLEGE_CODE_PATTERN);
  assert.equal(calls, 3);
  await assert.rejects(
    withFreshCollegeCode(async () => {
      throw Object.assign(new Error("slug"), { code: "23505", constraint: "colleges_slug_unique" });
    }),
    /slug/,
  );
});
