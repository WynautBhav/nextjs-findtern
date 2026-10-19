import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bankProblem,
  cascadeWorkModes,
  degreeOption,
  draftFromRecord,
  emptyDraft,
  formatProblems,
  monthLabel,
  scoreProblem,
  storedFromDraft,
  toMonth,
  validateProfile,
  validateStep,
  type OnboardingDraft,
} from "./onboarding.ts";

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

/* ── New fields: legacy round-trip ─────────────────────────────────────── */

test("qualifications read from legacy rows and untouched rows are written back verbatim", () => {
  const row = {
    extraData: {
      academics: {
        professionalCourses: [
          { id: "p1", courseNamePreset: "CA", courseNameOther: "", institution: "ICAI", status: "Completed", completionDate: "2024-05-01", certificateUploads: [{ name: "k" }] },
        ],
        certifications: [{ id: "c1", certificateName: "AWS CCP", institution: "AWS", startDate: "2023-01-01", endDate: "2023-03-01", certificateUploads: [] }],
      },
    },
  };
  const d = draftFromRecord(row);
  assert.deepEqual(d.academics?.professional?.[0], { id: "p1", name: "CA", issuer: "ICAI", year: "2024", credentialUrl: "" });
  assert.equal(d.academics?.certifications?.[0].year, "2023");

  const out = storedFromDraft(d, row);
  const a = out.extraPatch.academics as Record<string, unknown[]>;
  assert.deepEqual(a.professionalCourses[0], row.extraData.academics.professionalCourses[0], "unchanged row is not rewritten");

  const edited = { ...d, academics: { ...d.academics!, certifications: [{ ...d.academics!.certifications[0], credentialUrl: "https://aws.example/c" }] } };
  const cert = (storedFromDraft(edited, row).extraPatch.academics as Record<string, Record<string, unknown>[]>).certifications[0];
  assert.equal(cert.certificateName, "AWS CCP");
  assert.equal(cert.startDate, "2023-01-01", "legacy keys survive an edit");
  assert.equal(cert.credentialUrl, "https://aws.example/c");
});

test("emergency contact and score type read from legacy keys", () => {
  const d = draftFromRecord({ extraData: { emergencyCountryCode: "+44", emergencyPhone: "7700900123", emergencyContactName: "Asha", academics: { score: "84" } } });
  assert.equal(d.emergencyCountryCode, "+44");
  assert.equal(d.emergencyName, "Asha");
  assert.equal(d.academics?.scoreType, "percentage", "a score over 10 with no type is a percentage");
});

test("free-text experience months are read as YYYY-MM", () => {
  assert.equal(toMonth("Jan 2025"), "2025-01");
  assert.equal(toMonth("September 2024"), "2024-09");
  assert.equal(toMonth("2025-03-15"), "2025-03");
  assert.equal(toMonth("sometime"), "sometime");
  assert.equal(monthLabel("2025-01"), "Jan 2025");
});

test("degree dropdown recognises legacy spellings and falls back to Other", () => {
  assert.equal(degreeOption("BSc"), "B.Sc");
  assert.equal(degreeOption("B.Tech"), "B.Tech / B.E.");
  assert.equal(degreeOption("BE"), "B.Tech / B.E.");
  assert.equal(degreeOption("MA"), "M.A.");
  assert.equal(degreeOption("B.Arch"), "Other");
  assert.equal(degreeOption(""), "");
});

/* ── Validation ────────────────────────────────────────────────────────── */

const NOW = new Date("2026-10-19T00:00:00Z");

function complete(): OnboardingDraft {
  const d = emptyDraft();
  return {
    ...d,
    bio: "Final-year student who builds things.",
    city: "Jaipur",
    state: "Rajasthan",
    pinCode: "302017",
    linkedinUrl: "https://www.linkedin.com/in/someone",
    aadhaarNumber: "234567890123",
    panNumber: "ABCDE1234F",
    emergencyName: "Asha",
    emergencyCountryCode: "+91",
    emergencyPhone: "9812345670",
    academics: { ...d.academics, institution: "MNIT", degree: "B.Tech / B.E.", branch: "Computer Science", startYear: "2022", yearOfGraduation: "2026", cgpa: "8.4" },
    skills: ["React", "SQL", "Sales", "Excel"],
    locationTypes: ["remote"],
    hasLaptop: true,
    ndaAccepted: true,
  };
}
const ctx = { hasPanImage: true, hasPhoto: true, now: NOW };

test("a complete profile passes every step", () => {
  assert.equal(validateProfile(complete(), ctx), null);
});

test("Aadhaar number and PAN image are required on the About step", () => {
  const e = validateStep({ ...complete(), aadhaarNumber: "" }, 0, { ...ctx, hasPanImage: false });
  assert.ok(e.aadhaarNumber);
  assert.ok(e.panImage);
  assert.match(validateStep({ ...complete(), aadhaarNumber: "12345" }, 0, ctx).aadhaarNumber, /12 digits/);
  assert.ok(validateStep({ ...complete(), aadhaarNumber: "123456789012" }, 0, ctx).aadhaarNumber, "cannot start with 1");
});

test("emergency contact needs a name and a valid number", () => {
  const e = validateStep({ ...complete(), emergencyName: "", emergencyPhone: "12345" }, 0, ctx);
  assert.ok(e.emergencyName);
  assert.ok(e.emergencyPhone);
});

test("CGPA is capped at 10 and percentage at 100", () => {
  const base = complete();
  const cgpa = validateStep({ ...base, academics: { ...base.academics, scoreType: "cgpa", cgpa: "10.5" } }, 1, ctx);
  assert.match(cgpa.cgpa, /0 to 10/);
  const pct = validateStep({ ...base, academics: { ...base.academics, scoreType: "percentage", cgpa: "101" } }, 1, ctx);
  assert.match(pct.cgpa, /100/);
  assert.equal(validateStep({ ...base, academics: { ...base.academics, scoreType: "percentage", cgpa: "84" } }, 1, ctx).cgpa, undefined);
  assert.equal(scoreProblem("cgpa", "10"), null);
});

test("years: end after start, and a completed degree cannot end in the future", () => {
  const base = complete();
  const before = validateStep({ ...base, academics: { ...base.academics, startYear: "2024", yearOfGraduation: "2023" } }, 1, ctx);
  assert.ok(before.yearOfGraduation);
  const future = validateStep({ ...base, academics: { ...base.academics, status: "Completed", yearOfGraduation: "2027" } }, 1, ctx);
  assert.match(future.yearOfGraduation, /2026/);
  const pursuing = validateStep({ ...base, academics: { ...base.academics, status: "Pursuing", yearOfGraduation: "2027" } }, 1, ctx);
  assert.equal(pursuing.yearOfGraduation, undefined, "a pursuing degree may end in the future");
  assert.ok(validateStep({ ...base, academics: { ...base.academics, startYear: "" } }, 1, ctx).startYear);
});

test("degree: Other needs a typed name", () => {
  const base = complete();
  assert.ok(validateStep({ ...base, academics: { ...base.academics, degree: "Other" } }, 1, ctx).degree);
  assert.equal(validateStep({ ...base, academics: { ...base.academics, degree: "B.Arch" } }, 1, ctx).degree, undefined);
});

test("an added qualification row must be complete", () => {
  const base = complete();
  const row = { id: "q1", name: "CA", issuer: "", year: "2030", credentialUrl: "not a url" };
  const e = validateStep({ ...base, academics: { ...base.academics, professional: [row] } }, 1, ctx);
  assert.ok(e["professional.q1.issuer"]);
  assert.ok(e["professional.q1.year"]);
  assert.ok(e["professional.q1.credentialUrl"]);
  assert.equal(e["professional.q1.name"], undefined);
});

test("every field of an added experience is required", () => {
  const exp = { id: "e1", type: "Internship", company: "", role: "", from: "", to: "", current: false, description: "" };
  const e = validateStep({ ...complete(), experiences: [exp] }, 2, ctx);
  for (const f of ["company", "role", "from", "to", "description"]) assert.ok(e[`exp.e1.${f}`], f);

  const ongoing = { ...exp, company: "Acme", role: "Intern", from: "2026-06", current: true, description: "Built the onboarding flow end to end." };
  assert.deepEqual(validateStep({ ...complete(), experiences: [ongoing] }, 2, ctx), {}, "no end month needed while current");

  const backwards = { ...ongoing, current: false, to: "2026-01" };
  assert.match(validateStep({ ...complete(), experiences: [backwards] }, 2, ctx)["exp.e1.to"], /before the start/);
  assert.deepEqual(validateStep({ ...complete(), experiences: [] }, 2, ctx), {}, "experience itself stays optional");
});

test("LinkedIn, state and PIN are required on the About step", () => {
  const e = validateStep({ ...complete(), linkedinUrl: "", state: "", pinCode: "" }, 0, ctx);
  assert.ok(e.linkedinUrl);
  assert.ok(e.state);
  assert.ok(e.pinCode);
  assert.ok(validateStep({ ...complete(), linkedinUrl: "https://github.com/me" }, 0, ctx).linkedinUrl);
});

test("specialization and score are required even while pursuing", () => {
  const base = complete();
  const e = validateStep({ ...base, academics: { ...base.academics, status: "Pursuing", branch: "", cgpa: "" } }, 1, ctx);
  assert.ok(e.branch);
  assert.ok(e.cgpa);
});

test("work modes cascade: onsite includes hybrid and remote", () => {
  assert.deepEqual(cascadeWorkModes([], "onsite"), ["remote", "hybrid", "onsite"]);
  assert.deepEqual(cascadeWorkModes(["remote"], "hybrid"), ["remote", "hybrid"]);
  assert.deepEqual(cascadeWorkModes(["remote", "hybrid", "onsite"], "onsite"), ["remote", "hybrid"], "tapping the top steps back");
  assert.deepEqual(cascadeWorkModes(["remote", "hybrid", "onsite"], "remote"), ["remote"]);
  assert.deepEqual(cascadeWorkModes(["remote"], "remote"), []);
});

test("onsite or hybrid needs 1 to 5 preferred cities", () => {
  const base = complete();
  assert.ok(validateStep({ ...base, locationTypes: ["remote", "hybrid"], preferredLocations: [] }, 6, ctx).preferredLocations);
  assert.deepEqual(validateStep({ ...base, locationTypes: ["remote", "hybrid"], preferredLocations: ["Jaipur"] }, 6, ctx), {});
  assert.deepEqual(validateStep({ ...base, locationTypes: ["remote"], preferredLocations: [] }, 6, ctx), {});
  assert.ok(validateStep({ ...base, locationTypes: ["remote"], preferredLocations: ["a", "b", "c", "d", "e", "f"] }, 6, ctx).preferredLocations);
});

test("bank details are required in full", () => {
  const bank = { accountHolderName: "Asha", bankName: "SBI", accountNumber: "123456789012", ifscCode: "SBIN0001234", upiId: "" };
  assert.equal(bankProblem(bank), null);
  assert.ok(bankProblem({ ...bank, accountHolderName: "" }));
  assert.ok(bankProblem({ ...bank, accountNumber: "12ab" }));
  assert.ok(bankProblem({ ...bank, ifscCode: "SBIN1234" }));
});

test("draft saves only refuse impossible values", () => {
  assert.equal(formatProblems({ bio: "" }), null);
  assert.ok(formatProblems({ academics: { scoreType: "cgpa", cgpa: "42" } }));
});

test("UPI ID is optional but must look like name@bank", () => {
  const bank = { accountHolderName: "A B", bankName: "SBI", accountNumber: "123456789012", ifscCode: "SBIN0001234", upiId: "" };
  assert.equal(bankProblem(bank), null);
  assert.equal(bankProblem({ ...bank, upiId: "sunita.sharma@okaxis" }), null);
  assert.ok(bankProblem({ ...bank, upiId: "not-a-upi" }));
});
