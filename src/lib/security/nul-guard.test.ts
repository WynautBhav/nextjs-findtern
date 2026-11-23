import assert from "node:assert/strict";
import test from "node:test";

import { jsonTextHasNul, urlHasNul } from "./nul-guard.ts";

test("urlHasNul flags an encoded NUL in path or query, any case of the escape", () => {
  assert.equal(urlHasNul("http://x/api/interviews/a%00b/reschedule"), true);
  assert.equal(urlHasNul("http://x/api/college/presence/stream?drive=a%00b"), true);
  assert.equal(urlHasNul("http://x/api/college/drives/a%00"), true);
});

test("urlHasNul leaves ordinary URLs alone", () => {
  assert.equal(urlHasNul("http://x/api/college/drives/abc?page=2&q=a%20b"), false);
  assert.equal(urlHasNul("http://x/api/x/100%"), false);
  assert.equal(urlHasNul("http://x/api/x/a%2500b"), false);
});

test("jsonTextHasNul flags NUL in string values, nested values and keys", () => {
  assert.equal(jsonTextHasNul('{"title":"a\\u0000b"}'), true);
  assert.equal(jsonTextHasNul('{"a":{"b":["x","y\\u0000"]}}'), true);
  assert.equal(jsonTextHasNul('{"k\\u0000":1}'), true);
  assert.equal(jsonTextHasNul('"\\u0000"'), true);
});

test("jsonTextHasNul ignores look-alikes and bad JSON", () => {
  assert.equal(jsonTextHasNul('{"title":"a\\\\u0000b"}'), false); // escaped backslash then literal text
  assert.equal(jsonTextHasNul('{"title":"ok"}'), false);
  assert.equal(jsonTextHasNul("not json \\u0000"), false);
  assert.equal(jsonTextHasNul(""), false);
});
