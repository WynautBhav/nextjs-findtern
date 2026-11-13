import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { gettingStartedStage, showFee } from "./intern-stage.ts";

describe("showFee", () => {
  it("hides the fee while the profile is incomplete", () => {
    assert.equal(showFee(0), false);
  });
  it("shows the fee once the profile is complete", () => {
    assert.equal(showFee(1), true);
    assert.equal(showFee(2), true);
  });
});

describe("gettingStartedStage", () => {
  it("is 0 for an incomplete, unpaid profile", () => {
    assert.equal(gettingStartedStage({ profileComplete: false, activated: false, scored: false }), 0);
    assert.equal(showFee(gettingStartedStage({ profileComplete: false, activated: false, scored: false })), false);
  });
  it("is 1 once the profile is complete and unpaid", () => {
    assert.equal(gettingStartedStage({ profileComplete: true, activated: false, scored: false }), 1);
  });
  it("is 2 once paid, even if later profile rules reopened the profile", () => {
    assert.equal(gettingStartedStage({ profileComplete: false, activated: true, scored: false }), 2);
    assert.equal(gettingStartedStage({ profileComplete: true, activated: true, scored: false }), 2);
  });
  it("falls back to the profile stage for a scored but incomplete profile", () => {
    assert.equal(gettingStartedStage({ profileComplete: false, activated: true, scored: true }), 0);
  });
});
