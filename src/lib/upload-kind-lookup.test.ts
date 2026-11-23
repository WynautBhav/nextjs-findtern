import assert from "node:assert/strict";
import { test } from "node:test";

import { kindFor } from "./security/upload-rules.ts";

test("only a declared upload kind resolves; prototype names do not", () => {
  assert.ok(kindFor("aadhaar"));
  for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty", "", "nope"]) assert.equal(kindFor(k), undefined, k);
});
