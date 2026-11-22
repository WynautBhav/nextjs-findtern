import assert from "node:assert/strict";
import { test } from "node:test";

import { legacyFeeFlag } from "./fee-flag.ts";

test("legacy fee flag: boolean true and the string 'true' are paid, like isInternPaid; anything else is not", () => {
  assert.equal(legacyFeeFlag({ payment: { isPaid: true } }), true);
  assert.equal(legacyFeeFlag({ payment: { isPaid: "true" } }), true);
  for (const bad of [null, undefined, {}, { payment: null }, { payment: { isPaid: false } }, { payment: { isPaid: "false" } }, { payment: { isPaid: 1 } }, { payment: "true" }, "x"]) {
    assert.equal(legacyFeeFlag(bad), false);
  }
});
