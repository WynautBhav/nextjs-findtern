import { test } from "node:test";
import assert from "node:assert/strict";

import { matchesPlace, preferredCities, rawScore, toCandidateProfile } from "./employer-candidates.ts";

// EMB-02: legacy stored findternScore as a number or a numeric string and
// read it with Number(); the new pool must agree on who is scored.
test("rawScore reads numbers and numeric strings", () => {
  assert.equal(rawScore({ findternScore: 7.4 }), 7.4);
  assert.equal(rawScore({ findternScore: "6.25" }), 6.25);
  assert.equal(rawScore({ findternScore: " 8 " }), 8);
  assert.equal(rawScore({ findternScore: 0 }), 0);
});

test("rawScore treats anything else as not scored", () => {
  assert.equal(rawScore({}), null);
  assert.equal(rawScore({ findternScore: "" }), null);
  assert.equal(rawScore({ findternScore: "n/a" }), null);
  assert.equal(rawScore({ findternScore: null }), null);
  assert.equal(rawScore({ findternScore: Number.NaN }), null);
});

test("preferred cities: the city part, each city once, first spelling and order kept (QA-014)", () => {
  assert.deepEqual(preferredCities(["Bengaluru", "Bengaluru", "Remote"]), ["Bengaluru", "Remote"]);
  assert.deepEqual(preferredCities(["Mumbai, Maharashtra", "mumbai, Gujarat", "Pune, Maharashtra"]), ["Mumbai", "Pune"]);
  assert.deepEqual(preferredCities([" , x", ""]), []);
});

test("rawScore never goes above 10 (legacy rows, bad imports)", () => {
  assert.equal(rawScore({ findternScore: 11 }), 10);
  assert.equal(rawScore({ findternScore: "42" }), 10);
  assert.equal(rawScore({ findternScore: 10 }), 10);
});

test("AI links that are not http(s) never reach the browser", () => {
  const user = { id: "u1", firstName: "A", lastName: "B", email: "a@b.c" } as never;
  const onboarding = (extra: Record<string, unknown>) => ({ extraData: extra }) as never;
  const bad = toCandidateProfile(user, onboarding({ aiFeedbackLink: "javascript:alert(1)", aiRecordingLink: " data:text/html,x " }));
  assert.equal(bad.aiFeedbackLink, null);
  assert.equal(bad.aiRecordingLink, null);
  const ok = toCandidateProfile(user, onboarding({ aiFeedbackLink: " https://x.in/r ", aiRecordingLink: "" }));
  assert.equal(ok.aiFeedbackLink, "https://x.in/r");
  assert.equal(ok.aiRecordingLink, null);
});

test("matchesPlace: remote-only candidate shows when the toggle is on, not when off", () => {
  const remoteOnly = { preferredLocations: [], locationTypes: ["remote"] };
  assert.equal(matchesPlace(remoteOnly, { cities: ["Jaipur"], includeRemote: true }), true);
  assert.equal(matchesPlace(remoteOnly, { cities: ["Jaipur"], includeRemote: false }), false);
});

test("matchesPlace: an onsite candidate in another city stays out even with the toggle on", () => {
  const pune = { preferredLocations: ["Pune, Maharashtra"], locationTypes: ["onsite"] };
  assert.equal(matchesPlace(pune, { cities: ["Jaipur"], includeRemote: true }), false);
  assert.equal(matchesPlace(pune, { cities: ["pune"], includeRemote: false }), true);
  assert.equal(matchesPlace(pune, { cities: [], includeRemote: false }), true);
});
