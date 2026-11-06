import assert from "node:assert/strict";
import { test } from "node:test";

import { coverMessage, membershipLabel, rosterOnlyFacts, tpoStatus, tpoStatusLabel } from "./labels.ts";

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

test("roster-only rows never show onboarding or interview progress", () => {
  // On college A's roster, matched to nobody in A (verified at college B, AI interview done): just "On roster".
  assert.equal(tpoStatus(rosterOnlyFacts({ memberUserId: null, codeUsed: true })), "on_roster");
  // A claimed member of this college: at most "Registered", or "Code used" once they entered the code.
  assert.equal(tpoStatus(rosterOnlyFacts({ memberUserId: "u1", codeUsed: false })), "registered");
  assert.equal(tpoStatus(rosterOnlyFacts({ memberUserId: "u1", codeUsed: true })), "code_used");
  for (const memberUserId of [null, "u1"]) {
    const f = rosterOnlyFacts({ memberUserId, codeUsed: true });
    assert.equal(f.aiDone, false);
    assert.equal(f.onboardingDone, false);
  }
});
