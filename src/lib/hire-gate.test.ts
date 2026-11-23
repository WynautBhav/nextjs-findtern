import assert from "node:assert/strict";
import { test } from "node:test";

import { employerIncompleteMessage, hireGateLines, hireGateDecision, profileIncompleteBody, PROFILE_INCOMPLETE_CODE, PROFILE_INCOMPLETE_MESSAGE } from "./hire-gate.ts";

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

test("the company message promises nothing Findtern does not do, and names the blocking candidate of a cart", () => {
  assert.doesNotMatch(PROFILE_INCOMPLETE_MESSAGE.employer, /asked them|notif|remind/i);
  assert.match(employerIncompleteMessage("AB"), /^AB's profile is incomplete/);
  assert.equal(profileIncompleteBody("employer", [], "AB").error, employerIncompleteMessage("AB"));
  assert.equal(profileIncompleteBody("employer", []).error, PROFILE_INCOMPLETE_MESSAGE.employer);
  assert.equal(employerIncompleteMessage("  "), PROFILE_INCOMPLETE_MESSAGE.employer);
});

test("B-62 covers full-time lines at order creation; only a due month is exempt", () => {
  const lines = [{ id: "new" }, { id: "ft", fullTime: true }, { id: "due", due: { monthsPaid: 1 } }];
  assert.deepEqual(hireGateLines(lines).map((l) => l.id), ["new", "ft"]);
});

test("a College account passes once the college code is verified, and only then (funtosubs1, 23 Nov)", () => {
  const college = row({ accountType: "college" });
  assert.deepEqual(hireGateDecision(college, { ...docs, collegeVerified: true }), { ok: true });
  const refused = hireGateDecision(college, docs);
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && refused.missing.includes("accountType"));
});

test("every place that judges a profile complete also reads the college membership (College account interns were all blocked)", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of [
    "src/lib/hire-gate.ts",
    "src/lib/admin/profile-state-load.ts",
    "src/app/admin/interns/[id]/page.tsx",
    "src/lib/college/student-readiness-db.ts",
  ]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /profileDocsOf\(/, `${f} must build its docs with profileDocsOf (it carries collegeVerified)`);
    assert.match(src, /collegeMemberships/, `${f} must read the college membership`);
  }
});

test("profileDocsOf: files on file, and collegeVerified only for a live code-verified membership", async () => {
  const { profileDocsOf } = await import("./admin/profile-state.ts");
  assert.deepEqual(profileDocsOf({ photo: "a.jpg", pan: "p.jpg", aadhaar: null }, { status: "verified", verifiedBy: "college_code", leftAt: null }), { hasPhoto: true, hasPanImage: true, hasAadhaarImage: false, collegeVerified: true });
  assert.equal(profileDocsOf(undefined, { status: "verified", verifiedBy: "college_code", leftAt: new Date() }).collegeVerified, false);
  assert.equal(profileDocsOf(undefined, { status: "pending", verifiedBy: null }).collegeVerified, false);
  assert.equal(profileDocsOf(undefined, undefined).collegeVerified, false);
});

// PM-01: joining by a college code writes accountType "college" onto the profile; the onboarding step then wants the membership proof.
test("a college-account intern with a code-verified membership may be hired", () => {
  const r = row({ accountType: "college" });
  assert.deepEqual(hireGateDecision(r, { ...docs, collegeVerified: true }), { ok: true });
});

test("a college-account intern whose membership no code backs (claimed, left) is still refused", () => {
  const r = row({ accountType: "college" });
  for (const d of [hireGateDecision(r, docs), hireGateDecision(r, { ...docs, collegeVerified: false })]) {
    assert.equal(d.ok, false);
    if (!d.ok) assert.deepEqual(d.missing, ["accountType"]);
  }
});

test("an individual account is unaffected by the membership", () => {
  assert.deepEqual(hireGateDecision(row({ accountType: "individual" }), { ...docs, collegeVerified: false }), { ok: true });
  assert.deepEqual(hireGateDecision(row({ accountType: "individual" }), { ...docs, collegeVerified: true }), { ok: true });
});

test("a code-backed membership never rescues an otherwise incomplete profile", () => {
  assert.equal(hireGateDecision(row({ accountType: "college", languages: [] }), { ...docs, collegeVerified: true }).ok, false);
});

test("a legacy Aadhaar starting with 1 on file is accepted by the gate, as the final submit accepts it (INT-30)", () => {
  assert.deepEqual(hireGateDecision(row({}, { aadhaarNumber: "123456789012" }), docs), { ok: true });
  assert.deepEqual(hireGateDecision(row({}, { aadhaarNumber: "0123 4567 8901" }), docs), { ok: true });
});
