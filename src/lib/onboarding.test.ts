import assert from "node:assert/strict";
import { test } from "node:test";

import { draftFromRecord, storedFromDraft } from "./onboarding.ts";

// Shaped exactly like a row the legacy onboarding page saves.
const legacyRow = {
  bio: "Final-year CS student",
  city: "Jaipur",
  state: "Rajasthan",
  skills: [
    { id: "s1", name: "React", rating: 3 },
    { id: "s2", name: "SQL", rating: 1 },
  ],
  experienceJson: [{ id: "e1", type: "Internship", company: "Acme", role: "Intern", from: "2025-01", to: "2025-04", description: "" }],
  extraData: {
    academics: {
      level: "bachelors",
      degree: "B.Tech",
      specialization: "CSE",
      status: "Pursuing",
      institution: "MNIT",
      startYear: "2022",
      endYear: "2026",
      scoreType: "cgpa",
      score: "8.4",
      professionalCourses: [{ id: "c1", level: "CA" }],
    },
    languages: [{ id: "l1", language: "English", level: "professional", read: "yes", write: "yes", speak: "no" }],
    extracurricular: [{ id: "a1", activity: "Debate", level: "Advanced" }],
    bankDetails: { accountHolderName: "A", bankName: "SBI", accountNumber: "1234", ifscCode: "SBIN0001", upiId: "" },
    findternScore: 7.5,
  },
};

test("reads every legacy field", () => {
  const d = draftFromRecord(legacyRow);
  assert.deepEqual(d.skills, ["React", "SQL"]);
  assert.equal(d.skillsWithRatings?.[0].rating, "Advanced");
  assert.equal(d.academics?.qualificationLevel, "Bachelor's");
  assert.equal(d.academics?.branch, "CSE");
  assert.equal(d.academics?.yearOfGraduation, "2026");
  assert.equal(d.academics?.cgpa, "8.4");
  assert.equal(d.languages?.[0].level, "Professional");
  assert.equal(d.languages?.[0].speak, false);
  assert.equal(d.extracurriculars?.[0].activity, "Debate");
  assert.equal(d.bank?.ifscCode, "SBIN0001");
});

test("round-trip writes the legacy shape and keeps unknown legacy keys", () => {
  const d = draftFromRecord(legacyRow);
  const out = storedFromDraft(d, legacyRow);
  assert.deepEqual(out.skills, [
    { id: "s1", name: "React", rating: 3 },
    { id: "s2", name: "SQL", rating: 1 },
  ]);
  const a = out.extraPatch.academics as Record<string, unknown>;
  assert.equal(a.level, "bachelors");
  assert.equal(a.specialization, "CSE");
  assert.equal(a.endYear, "2026");
  assert.equal(a.startYear, "2022", "fields the new form doesn't edit survive");
  assert.deepEqual(a.professionalCourses, [{ id: "c1", level: "CA" }]);
  const l = (out.extraPatch.languages as Record<string, unknown>[])[0];
  assert.equal(l.level, "professional");
  assert.equal(l.speak, "no");
  assert.ok(Array.isArray(out.extraPatch.extracurricular));
  assert.equal(out.extraPatch.extracurriculars, undefined);
});

test("bare-string skills from early builds still read", () => {
  const d = draftFromRecord({ skills: ["Figma"], extraData: { skillsWithRatings: [{ name: "Figma", rating: "Advanced" }] } });
  assert.equal(d.skillsWithRatings?.[0].rating, "Advanced");
});
