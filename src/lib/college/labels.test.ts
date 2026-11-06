import assert from "node:assert/strict";
import { test } from "node:test";

import { membershipLabel } from "./labels.ts";

test("claimed student on the roster is not told they are missing from it", () => {
  assert.equal(membershipLabel({ status: "claimed", onRoster: true }), "On your roster, not verified yet. Share your student code");
});

test("claimed student not on the roster", () => {
  assert.equal(membershipLabel({ status: "claimed", onRoster: false }), "Claimed, not verified. Share your student code");
});

test("verified student", () => {
  assert.equal(membershipLabel({ status: "verified", onRoster: false }), "Verified");
});
