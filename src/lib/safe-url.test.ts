import { test } from "node:test";
import assert from "node:assert/strict";

import { isSafeLink } from "./safe-url.ts";

test("isSafeLink allows http(s) and, when asked, site paths only", () => {
  assert.equal(isSafeLink("https://a.com/x"), true);
  assert.equal(isSafeLink("javascript:alert(1)"), false);
  assert.equal(isSafeLink("JaVaScript:alert(1)", true), false);
  assert.equal(isSafeLink("data:text/html,x", true), false);
  assert.equal(isSafeLink("/skills?x=1"), false);
  assert.equal(isSafeLink("/skills?x=1", true), true);
  assert.equal(isSafeLink("//evil.com", true), false);
});
