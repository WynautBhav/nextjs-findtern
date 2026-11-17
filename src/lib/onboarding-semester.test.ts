import assert from "node:assert/strict";
import { test } from "node:test";

import { proofSlots, semesterOptions } from "./cgpa-verification.ts";
import {
  MAX_MARKSHEETS,
  draftFromRecord,
  emptyDraft,
  certificateFiles,
  levelHasSemesters,
  semesterProofErrors,
  storedFileNames,
  storedFromDraft,
  validateStep,
  type CertificateUpload,
  type OnboardingDraft,
} from "./onboarding.ts";

const up = (name: string, type = "image/webp"): CertificateUpload => ({ name, originalName: `${name}.jpg`, type, size: 1000 });
const proofsFor = (semester: number): Record<string, CertificateUpload> =>
  Object.fromEntries(proofSlots(semester).map((s) => [s.key, up(`u1.${s.key.replace(/\W/g, "")}aaaaaaaaaaaaaaaaaaaa.webp`)]));

const academics = (over: Partial<OnboardingDraft["academics"]> = {}): OnboardingDraft["academics"] => ({
  ...emptyDraft().academics,
  qualificationLevel: "Bachelor's",
  status: "Pursuing",
  institution: "JECRC University",
  degree: "B.Tech",
  startYear: "2023",
  scoreType: "cgpa",
  cgpa: "8.4",
  ...over,
});

test("MAX_MARKSHEETS is 10 so semester 10 has its ten slots", () => {
  assert.equal(MAX_MARKSHEETS, 10);
  assert.equal(proofSlots(10).length, MAX_MARKSHEETS);
});

test("levelHasSemesters: degrees and diplomas, not Ph.D or school", () => {
  assert.equal(levelHasSemesters("Bachelor's"), true);
  assert.equal(levelHasSemesters("Master's"), true);
  assert.equal(levelHasSemesters("Diploma"), true);
  assert.equal(levelHasSemesters("Ph.D"), false);
  assert.equal(levelHasSemesters("High School"), false);
  assert.equal(levelHasSemesters(""), false);
});

test("a 3rd-year student is offered semesters 5 and 6", () => {
  assert.deepEqual(semesterOptions(3), [5, 6]);
});

test("proof matrix: semesters 1, 2, 5, 6 and 10 need exactly N slots, each missing one is named", () => {
  for (const n of [1, 2, 5, 6, 10]) {
    const none = semesterProofErrors(academics({ currentSemester: n }));
    assert.deepEqual(Object.keys(none).sort(), proofSlots(n).map((s) => `proof-${s.key}`).sort(), `semester ${n}: every slot is asked for`);
    assert.equal(Object.keys(none).length, n);
    assert.deepEqual(semesterProofErrors(academics({ currentSemester: n, semesterProofUploads: proofsFor(n) })), {}, `semester ${n}: all present passes`);
  }
});

test("one missing slot gives one per-slot message", () => {
  const proofs = proofsFor(5);
  delete proofs["marksheet-3"];
  const errors = semesterProofErrors(academics({ currentSemester: 5, semesterProofUploads: proofs }));
  assert.deepEqual(Object.keys(errors), ["proof-marksheet-3"]);
  assert.equal(errors["proof-marksheet-3"], "Upload your semester 3 marksheet.");
  const noId = proofsFor(5);
  delete noId["college-id"];
  assert.equal(semesterProofErrors(academics({ currentSemester: 5, semesterProofUploads: noId }))["proof-college-id"], "Upload your college ID card.");
});

test("a PDF or a non-image in a slot is refused for that slot", () => {
  const proofs = proofsFor(2);
  proofs["marksheet-1"] = up("u1.pdfaaaaaaaaaaaaaaaaaaaaaa.pdf", "application/pdf");
  const errors = semesterProofErrors(academics({ currentSemester: 2, semesterProofUploads: proofs }));
  assert.deepEqual(Object.keys(errors), ["proof-marksheet-1"]);
  assert.match(errors["proof-marksheet-1"], /JPG or PNG/);
});

test("the same file in two slots is refused", () => {
  const proofs = proofsFor(2);
  proofs["college-id"] = { ...proofs["marksheet-1"] };
  const errors = semesterProofErrors(academics({ currentSemester: 2, semesterProofUploads: proofs }));
  assert.deepEqual(Object.keys(errors), ["proof-college-id"]);
  assert.match(errors["proof-college-id"], /different photo/);
});

test("legacy intern: no semester, or no score, or a level without semesters: nothing is asked", () => {
  assert.deepEqual(semesterProofErrors(academics({ currentSemester: null })), {});
  assert.deepEqual(semesterProofErrors(academics()), {});
  assert.deepEqual(semesterProofErrors(academics({ currentSemester: 5, cgpa: "" })), {});
  assert.deepEqual(semesterProofErrors(academics({ currentSemester: 5, qualificationLevel: "Ph.D" })), {});
  assert.deepEqual(semesterProofErrors(academics({ currentSemester: 5, qualificationLevel: "High School" })), {});
});

test("an impossible semester is refused", () => {
  for (const n of [0, 11, 2.5, -1]) {
    assert.ok(semesterProofErrors(academics({ currentSemester: n }))["currentSemester"], String(n));
  }
});

test("the Academics step (client validation) carries the same per-slot errors", () => {
  const values: OnboardingDraft = { ...emptyDraft(), academics: academics({ currentSemester: 5 }) };
  const errors = validateStep(values, 1, { hasPanImage: true, hasAadhaarImage: true, hasPhoto: true, ownPhone: null, storedAadhaar: "", accountTypeRequired: false, collegeVerified: false });
  assert.equal(Object.keys(errors).filter((k) => k.startsWith("proof-")).length, 5);
  const ok: OnboardingDraft = { ...values, academics: { ...values.academics, semesterProofUploads: proofsFor(5) } };
  const clean = validateStep(ok, 1, { hasPanImage: true, hasAadhaarImage: true, hasPhoto: true, ownPhone: null, storedAadhaar: "", accountTypeRequired: false, collegeVerified: false });
  assert.equal(Object.keys(clean).filter((k) => k.startsWith("proof-")).length, 0);
});

test("storedFromDraft writes currentSemester and the keyed proofs", () => {
  const proofs = proofsFor(2);
  const { extraPatch } = storedFromDraft({ academics: academics({ currentSemester: 2, semesterProofUploads: proofs }) }, null);
  const a = extraPatch.academics as Record<string, unknown>;
  assert.equal(a.currentSemester, 2);
  assert.deepEqual(Object.keys(a.semesterProofUploads as object).sort(), ["college-id", "marksheet-1"]);
});

test("the proofs are listed as documents with their slot label (documents pages and the admin file route use this list)", () => {
  const { extraPatch } = storedFromDraft({ academics: academics({ currentSemester: 2, semesterProofUploads: proofsFor(2) }) }, null);
  const files = certificateFiles(extraPatch.academics);
  assert.deepEqual(files.map((f) => f.label), ["Semester 1 marksheet", "College ID card"]);
  const names = storedFileNames(extraPatch.academics);
  for (const f of files) assert.ok(names.has(f.name));
});

test("draftFromRecord reads them back, and the generic marksheet list is untouched", () => {
  const { extraPatch } = storedFromDraft({ academics: { ...academics({ currentSemester: 2, semesterProofUploads: proofsFor(2) }), marksheetUploads: [up("u1.latestaaaaaaaaaaaaaaaaaaaa.webp")] } }, null);
  const back = draftFromRecord({ extraData: { academics: extraPatch.academics } });
  assert.equal(back.academics?.currentSemester, 2);
  assert.equal(Object.keys(back.academics?.semesterProofUploads ?? {}).length, 2);
  assert.deepEqual(back.academics?.marksheetUploads?.map((u) => u.name), ["u1.latestaaaaaaaaaaaaaaaaaaaa.webp"]);
});

test("a save that does not mention the semester keeps what is stored; null clears it", () => {
  const first = storedFromDraft({ academics: academics({ currentSemester: 2, semesterProofUploads: proofsFor(2) }) }, null);
  const stored = { extraData: { academics: first.extraPatch.academics } };
  const partial = { academics: { institution: "JECRC University", degree: "B.Tech", branch: "", yearOfGraduation: "" } };
  const kept = storedFromDraft(partial, stored).extraPatch.academics as Record<string, unknown>;
  assert.equal(kept.currentSemester, 2);
  assert.equal(Object.keys(kept.semesterProofUploads as object).length, 2);
  const cleared = storedFromDraft({ academics: { ...partial, currentSemester: null } }, stored).extraPatch.academics as Record<string, unknown>;
  assert.equal("currentSemester" in cleared, false);
  assert.equal("semesterProofUploads" in cleared, false);
});

test("proofs for slots the semester no longer has are dropped when the semester changes", () => {
  const first = storedFromDraft({ academics: academics({ currentSemester: 6, semesterProofUploads: proofsFor(6) }) }, null);
  const stored = { extraData: { academics: first.extraPatch.academics } };
  const next = storedFromDraft({ academics: academics({ currentSemester: 5, semesterProofUploads: proofsFor(6) }) }, stored).extraPatch.academics as Record<string, unknown>;
  assert.deepEqual(Object.keys(next.semesterProofUploads as object).sort(), proofSlots(5).map((s) => s.key).sort());
});

test("a completed degree or a Ph.D has no semester: a stale one is cleared on save", () => {
  const first = storedFromDraft({ academics: academics({ currentSemester: 2, semesterProofUploads: proofsFor(2) }) }, null);
  const stored = { extraData: { academics: first.extraPatch.academics } };
  const done = storedFromDraft({ academics: academics({ status: "Completed", currentSemester: 2, semesterProofUploads: proofsFor(2) }) }, stored).extraPatch.academics as Record<string, unknown>;
  assert.equal("currentSemester" in done, false);
  assert.deepEqual(semesterProofErrors(academics({ status: "Completed", currentSemester: 2 })), {});
});
