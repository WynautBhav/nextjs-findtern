import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COLLEGE_CODE_ALPHABET,
  COLLEGE_CODE_PATTERN,
  codesEqual,
  generateCollegeCode,
  maskCode,
  parseCollegeCode,
  withFreshCollegeCode,
} from "./code.ts";

test("generated codes are FT + 8 unambiguous characters, and differ", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const c = generateCollegeCode();
    assert.match(c, COLLEGE_CODE_PATTERN);
    assert.equal(c.length, 10);
    assert.equal(parseCollegeCode(c), c);
    seen.add(c);
  }
  assert.equal(seen.size, 500);
  for (const ch of "0O1IL") assert.ok(!COLLEGE_CODE_ALPHABET.includes(ch), `${ch} is ambiguous`);
  assert.doesNotMatch("FT0O1ILABC", COLLEGE_CODE_PATTERN);
});

test("typed codes are normalised: case, spaces, dashes, full-width; names and junk are not codes", () => {
  assert.equal(parseCollegeCode(" ft-7kq3 m8xz "), "FT7KQ3M8XZ");
  assert.equal(parseCollegeCode("FT7KQ3M8XZ"), "FT7KQ3M8XZ");
  assert.equal(parseCollegeCode("ＦＴ７ＫＱ３Ｍ８ＸＺ"), "FT7KQ3M8XZ");
  assert.equal(parseCollegeCode("FT7KQ3M8X"), null); // 7 chars
  assert.equal(parseCollegeCode("FT7KQ3M8X0"), null); // 0 is not in the alphabet
  assert.equal(parseCollegeCode("JK Lakshmipat"), null);
  assert.equal(parseCollegeCode(""), null);
  assert.equal(parseCollegeCode("A".repeat(5000)), null);
  for (const v of [null, undefined, 12345, { code: "FT7KQ3M8XZ" }, ["FT7KQ3M8XZ"]]) assert.equal(parseCollegeCode(v), null);
});

test("legacy 5-character codes still validate (until an admin rotates them)", () => {
  assert.equal(parseCollegeCode(" ft-7kq3m "), "FT7KQ3M");
  assert.equal(parseCollegeCode("FT7KQ3"), null);
  assert.equal(parseCollegeCode("FT7KQ30"), null);
});

test("comparison is exact and never matches an empty stored code", () => {
  assert.equal(codesEqual("FT7KQ3M8XZ", "FT7KQ3M8XZ"), true);
  assert.equal(codesEqual("FT7KQ3M8XZ", "FT7KQ3M8XY"), false);
  assert.equal(codesEqual("FT7KQ3M", "FT7KQ3M8XZ"), false);
  assert.equal(codesEqual("", ""), false);
  assert.equal(codesEqual("FT7KQ3M8XZ", null), false);
  assert.equal(codesEqual("FT7KQ3M8XZ", undefined), false);
});

test("the audit mask never contains the whole code", () => {
  const m = maskCode("ft-7kq3 m8xz");
  assert.equal(m, "FT7•••••••");
  assert.ok(!m.includes("7KQ3"));
  assert.equal(maskCode("abc"), "short");
  assert.equal(maskCode(null), "short");
  assert.ok(!maskCode("FT7KQ3M").includes("KQ3M"));
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
