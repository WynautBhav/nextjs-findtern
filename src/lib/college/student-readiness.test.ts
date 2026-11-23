import { test } from "node:test";
import assert from "node:assert/strict";

import { hasMarksheet, openStepOf, readinessFrom } from "./student-readiness.ts";

const base: Parameters<typeof readinessFrom>[0] = { inPool: true, profileVisibility: "live", isActive: true, frozen: false, openToWork: true, hiddenByAdmin: false, rejected: false, interviewed: true, hireable: true, submitted: true, openStep: null, marksheet: true };

test("in the pool and complete: seen and hireable, no lines", () => {
  assert.deepEqual(readinessFrom(base), { seen: true, seenWhy: "", hidden: null, hireable: true, hireWhy: "", paused: false, marksheet: true });
});

test("the pool decides seen; an incomplete profile only blocks the hire, by step name", () => {
  const r = readinessFrom({ ...base, hireable: false, openStep: 0 });
  assert.equal(r.seen, true);
  assert.equal(r.hireWhy, "Profile incomplete: About me is not finished.");
  assert.doesNotMatch(r.hireWhy, /aadhaar|pan|bank|emergency/i);
  assert.equal(readinessFrom({ ...base, hireable: false, submitted: false }).hireWhy, "Profile not submitted yet.");
});

test("out of the pool: a Findtern hide or freeze reads as paused, without the reason", () => {
  for (const o of [{ frozen: true }, { isActive: false }, { profileVisibility: "hidden" }, { hiddenByAdmin: true, openToWork: false }]) {
    const r = readinessFrom({ ...base, inPool: false, ...o });
    assert.equal(r.seen, false);
    assert.equal(r.seenWhy, "Paused by Findtern. Contact Findtern for details.");
  }
  assert.equal(readinessFrom({ ...base, frozen: true }).paused, true);
});

test("out of the pool for the student's own reasons, then Findtern's checks (never the fee)", () => {
  const out = { ...base, inPool: false };
  assert.equal(readinessFrom({ ...out, openToWork: false }).seenWhy, "The student turned off Open to work.");
  assert.equal(readinessFrom({ ...out, interviewed: false }).seenWhy, "The AI interview is not done yet.");
  assert.equal(readinessFrom(out).seenWhy, "Waiting on Findtern's checks.");
  assert.doesNotMatch(readinessFrom(out).seenWhy, /fee|paid|₹/i);
});

test("no onboarding row means About me is open", () => {
  assert.deepEqual(openStepOf(null, { hasPhoto: false, hasPanImage: false, hasAadhaarImage: false }), { submitted: false, openStep: 0 });
});

test("marksheet flag reads only that a file exists", () => {
  assert.equal(hasMarksheet({ academics: { marksheetUploads: [{ name: "k/1.pdf" }] } }), true);
  assert.equal(hasMarksheet({ academics: { marksheetUploads: [] } }), false);
  assert.equal(hasMarksheet(null), false);
});

test("marksheet flag counts the semester marksheet photos from the profile form, not the college ID", () => {
  assert.equal(hasMarksheet({ academics: { semesterProofUploads: { "marksheet-1": { name: "k/s1.png" }, "college-id": { name: "k/id.png" } } } }), true);
  assert.equal(hasMarksheet({ academics: { semesterProofUploads: { "last-year-marksheet": { name: "k/ly.png" } } } }), true);
  assert.equal(hasMarksheet({ academics: { semesterProofUploads: { "college-id": { name: "k/id.png" } } } }), false);
  assert.equal(hasMarksheet({ academics: { semesterProofUploads: { "marksheet-1": { name: "" } } } }), false);
});

test("hidden profiles: one reason each, the first that blocks, in the order the officer reads them", () => {
  const out = { ...base, inPool: false };
  const reason = (o: Partial<typeof base>) => readinessFrom({ ...out, ...o }).hidden;
  assert.equal(readinessFrom(base).hidden, null);
  assert.equal(reason({ frozen: true, rejected: true }), "paused");
  assert.equal(reason({ rejected: true, openToWork: false }), "rejected");
  assert.equal(readinessFrom({ ...out, rejected: true }).seenWhy, "Findtern did not approve this profile.");
  assert.equal(reason({ openToWork: false, submitted: false }), "open_to_work");
  assert.equal(reason({ submitted: false, interviewed: false }), "interview");
  assert.equal(reason({ openStep: 2 }), "profile");
  assert.equal(reason({ submitted: false }), "profile");
  assert.equal(reason({ interviewed: false }), "interview");
  assert.equal(reason({}), "checks");
  // In the pool = not hidden, whatever the flags say (the pool query is the truth).
  assert.equal(readinessFrom({ ...base, submitted: false }).hidden, null);
});

// R4-01: the college view asks the hire gate the same question as the real gate (code-backed live membership), via one batched membership list.
test("R4-01: code-verified, claimed and left students get the gate's verdict", async () => {
  const { codeVerifiedUserIds } = await import("./student-readiness.ts");
  const { hireGateDecision } = await import("../hire-gate.ts");
  const row = { city: "Pune", state: "Maharashtra", pinCode: "411001", skills: ["React", "SQL", "Excel", "Python"], locationTypes: ["remote"], preferredLocations: [], hasLaptop: true, aadhaarNumber: "234567890123", panNumber: "ABCDE1234F", extraData: { accountType: "college", profileSubmittedAt: "2026-10-01T00:00:00.000Z", languages: [{ id: "l1", language: "english", level: "professional", read: true, write: true, speak: true }], emergencyPhone: "9812345678", emergencyName: "Asha Rao", emergencyRelation: "Mother", ndaAcceptedAt: "2026-10-01", academics: { qualificationLevel: "Bachelor", status: "Pursuing", institution: "ABC College", degree: "B.Tech", startYear: "2023" } } };
  const docs = { hasPhoto: true, hasPanImage: true, hasAadhaarImage: false };
  const ids = codeVerifiedUserIds([
    { userId: "code", status: "verified", verifiedBy: "college_code", leftAt: null },
    { userId: "claimed", status: "claimed", verifiedBy: "email_domain", leftAt: null },
    { userId: "left", status: "verified", verifiedBy: "college_code", leftAt: new Date() },
  ]);
  for (const [id, ok] of [["code", true], ["claimed", false], ["left", false], ["none", false]] as const) {
    assert.equal(hireGateDecision(row, docs, ids.has(id)).ok, ok, id);
  }
});
