import assert from "node:assert/strict";
import { test } from "node:test";

import { hireGateDecision, profileIncompleteBody, PROFILE_INCOMPLETE_CODE, PROFILE_INCOMPLETE_MESSAGE } from "./hire-gate.ts";

const docs = { hasPhoto: true, hasPanImage: true, hasAadhaarImage: false };
const row = (extra: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({
  city: "Pune",
  state: "Maharashtra",
  pinCode: "411001",
  skills: ["React", "SQL", "Excel", "Python"],
  locationTypes: ["remote"],
  preferredLocations: [],
  hasLaptop: true,
  extraData: {
    profileSubmittedAt: "2026-10-01T00:00:00.000Z",
    languages: [{ id: "l1", language: "english", level: "professional", read: true, write: true, speak: true }],
    emergencyPhone: "9812345678", emergencyName: "Asha Rao", emergencyRelation: "Mother", ndaAcceptedAt: "2026-10-01",
    academics: { qualificationLevel: "Bachelor", status: "Pursuing", institution: "ABC College", degree: "B.Tech", startYear: "2023" },
    ...extra,
  },
  aadhaarNumber: "234567890123",
  panNumber: "ABCDE1234F",
  ...over,
});

test("a submitted, fully filled profile may be hired", () => {
  assert.deepEqual(hireGateDecision(row(), docs), { ok: true });
});

test("no onboarding row at all is refused", () => {
  assert.deepEqual(hireGateDecision(null, docs), { ok: false, missing: ["profile"] });
});

test("a filled profile that was never submitted is refused and says so", () => {
  const d = hireGateDecision(row({ profileSubmittedAt: undefined }), docs);
  assert.equal(d.ok, false);
  if (!d.ok) assert.deepEqual(d.missing, ["profileSubmittedAt"]);
});

test("a legacy scored row counts as submitted, exactly as the admin list does", () => {
  assert.deepEqual(hireGateDecision(row({ profileSubmittedAt: undefined, findternScore: 7.5 }), docs), { ok: true });
});

test("missing fields are listed from every step, as field ids and never values", () => {
  const d = hireGateDecision(row({ languages: [], academics: {} }, { panNumber: "" }), { ...docs, hasPanImage: false });
  assert.equal(d.ok, false);
  if (d.ok) return;
  assert.ok(d.missing.includes("languages"));
  assert.ok(d.missing.length >= 3, d.missing.join(","));
  for (const m of d.missing) assert.match(m, /^[A-Za-z][A-Za-z0-9_.-]*$/);
  assert.ok(!d.missing.some((m) => m.includes("Pune") || m.includes("234567890123")));
});

test("agrees with the admin rule for every case above", async () => {
  const { isProfileSubmittedComplete } = await import("./admin/profile-state.ts");
  for (const [r, d] of [[row(), docs], [row({ languages: [] }), docs], [row(), { ...docs, hasPhoto: false }], [null, docs]] as const) {
    assert.equal(hireGateDecision(r, d).ok, isProfileSubmittedComplete(r, d));
  }
});

test("the 409 body: the candidate sees what to fix, the company sees only that the profile is incomplete", () => {
  const intern = profileIncompleteBody("intern", ["panNumber"]);
  assert.equal(intern.code, PROFILE_INCOMPLETE_CODE);
  assert.equal(intern.error, PROFILE_INCOMPLETE_MESSAGE.intern);
  assert.deepEqual(intern.missing, ["panNumber"]);
  const employer = profileIncompleteBody("employer", ["panNumber"]);
  assert.equal(employer.code, "PROFILE_INCOMPLETE");
  assert.equal(employer.error, PROFILE_INCOMPLETE_MESSAGE.employer);
  assert.equal("missing" in employer, false);
});
