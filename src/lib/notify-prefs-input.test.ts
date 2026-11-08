import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prefsBody } from "./notify-prefs-input.ts";

describe("prefsBody", () => {
  it("accepts one or both switches", () => {
    assert.equal(prefsBody.safeParse({ emailMessages: false }).success, true);
    assert.equal(prefsBody.safeParse({ pushMessages: true }).success, true);
    assert.equal(prefsBody.safeParse({ emailMessages: true, pushMessages: false }).success, true);
  });
  it("rejects empty, non-boolean and unknown keys (no userId, no category for required mail)", () => {
    for (const bad of [{}, null, "x", { emailMessages: "yes" }, { emailMessages: 1 }, { userId: "other", emailMessages: true }, { emailMessages: true, payments: false }, { required: false }]) {
      assert.equal(prefsBody.safeParse(bad).success, false, JSON.stringify(bad));
    }
  });
});
