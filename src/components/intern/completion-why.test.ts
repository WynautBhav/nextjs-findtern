import assert from "node:assert/strict";
import { test } from "node:test";

import { completionWhy } from "./completion-why.ts";

test("identity step is worded plainly", () => {
  const r = completionWhy("identity");
  assert.equal(r.label, "Identity documents for payouts");
  assert.doesNotMatch(r.label ?? "", /Aadhaar|PAN/);
});

test("unknown ids fall back", () => {
  assert.equal(completionWhy("zzz").label, null);
  assert.ok(completionWhy("zzz").why.length > 0);
});
