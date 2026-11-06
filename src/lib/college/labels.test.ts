import assert from "node:assert/strict";
import { test } from "node:test";

import { coverMessage, membershipLabel, tpoStatus, tpoStatusLabel } from "./labels.ts";

test("claimed student on the roster is not told they are missing from it", () => {
  assert.equal(membershipLabel({ status: "claimed", onRoster: true }), "On your roster, not verified yet. Share your student code");
});

test("claimed student not on the roster", () => {
  assert.equal(membershipLabel({ status: "claimed", onRoster: false }), "Claimed, not verified. Share your student code");
});

test("verified student", () => {
  assert.equal(membershipLabel({ status: "verified", onRoster: false }), "Verified");
});

test("tpoStatus is the furthest step reached", () => {
  const f = { registered: false, onboardingDone: false, codeUsed: false, aiDone: false };
  assert.equal(tpoStatus(f), "on_roster");
  assert.equal(tpoStatus({ ...f, registered: true }), "registered");
  assert.equal(tpoStatus({ ...f, registered: true, onboardingDone: true }), "onboarded");
  assert.equal(tpoStatus({ ...f, registered: true, onboardingDone: true, codeUsed: true }), "code_used");
  assert.equal(tpoStatus({ registered: true, onboardingDone: true, codeUsed: true, aiDone: true }), "ai_done");
  assert.equal(tpoStatus({ ...f, registered: true, codeUsed: true }), "code_used"); // code used before onboarding is finished
  assert.equal(tpoStatusLabel("onboarded"), "Onboarding done");
});

test("coverMessage: covered, switched off, no seats, and nothing for a non-partner", () => {
  const base = { collegeName: "JKLU", isPartner: true, isActive: true, seatsLeft: 12 };
  assert.deepEqual(coverMessage(base), { tone: "covered", text: "Your college covers this interview. Enter the code from your placement officer." });
  assert.equal(coverMessage({ ...base, isActive: false })?.tone, "unavailable");
  assert.match(coverMessage({ ...base, seatsLeft: 0 })?.text ?? "", /no seats left/);
  assert.equal(coverMessage({ ...base, isPartner: false }), null);
  assert.equal(coverMessage({ ...base, seatsLeft: null }), null);
  assert.equal(coverMessage(null), null);
});
