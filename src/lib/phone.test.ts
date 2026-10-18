import test from "node:test";
import assert from "node:assert/strict";

import { isValidPhone, phoneError } from "./phone.ts";

test("Indian mobiles are 10 digits starting 6-9", () => {
  assert.equal(isValidPhone("+91", "9876543211"), true);
  assert.equal(isValidPhone("+91", "6203948571"), true);
  assert.equal(isValidPhone("+91", "5876543211"), false);
  assert.equal(isValidPhone("+91", "0876543211"), false);
  assert.equal(isValidPhone("+91", "987654321"), false);
  assert.equal(isValidPhone("+91", "98765432110"), false);
});

test("formatting characters are ignored", () => {
  assert.equal(isValidPhone("+91", "98765 43211"), true);
  assert.equal(isValidPhone("+91", "98765-43211"), true);
});

test("junk numbers are rejected", () => {
  assert.equal(isValidPhone("+91", "9999999999"), false);
  assert.equal(isValidPhone("+91", "9876543210"), false);
  assert.equal(isValidPhone("+1", "1234567890"), false);
});

test("other countries take 6 to 15 digits", () => {
  assert.equal(isValidPhone("+1", "2015550123"), true);
  assert.equal(isValidPhone("+971", "501234568"), true);
  assert.equal(isValidPhone("+44", "12345"), false);
  assert.equal(isValidPhone("+44", "1234567890123456"), false);
});

test("bad country codes are rejected", () => {
  assert.notEqual(phoneError("91", "9876543211"), null);
  assert.notEqual(phoneError("+abc", "9876543211"), null);
});
