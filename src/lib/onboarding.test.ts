import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bankProblem,
  canonicalDegree,
  cascadeWorkModes,
  degreeOption,
  draftFromRecord,
  emptyDraft,
  firstOpenStep,
  formatProblems,
  isOnboarded,
  isRealDay,
  monthLabel,
  profileCompletion,
  scoreProblem,
  skillsToStore,
  storedFileNames,
  storedFromDraft,
  toDay,
  dateLabel,
  toMonth,
  validateProfile,
  validateStep,
  widestWorkMode,
  type OnboardingDraft,
} from "./onboarding.ts";
import { aiInviteHoldsSkills, hasAssessmentRating, sameRatedSkills } from "./skills-lock-rules.ts";
import { didYouMean, SUGGESTED_SKILLS, NON_TECH_SKILLS, TECH_SKILLS } from "./data/skills.ts";
import { districtsOf } from "./data/districts.ts";

// Shaped exactly like a row the legacy onboarding page saves.
const legacyRow = {
  bio: "Final-year CS student",
  city: "Jaipur",
  state: "Rajasthan",
  skills: [
    { id: "s1", name: "React", rating: 3 },
    { id: "s2", name: "SQL", rating: 1 },
  ],
  experienceJson: [
    { id: "e1", type: "Internship", company: "Acme", role: "Intern", from: "2025-01-10", to: "2025-04-30", description: "x" },
    { id: "e2", type: "Job", company: "Beta", role: "Analyst", from: "2025-06-01", to: "Present", description: "y" },
  ],
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
      marksheetUploads: [{ name: "u1.aaaaaaaaaaaaaaaaaaaaaa.pdf", type: "application/pdf", size: 10, originalName: "sem6.pdf" }],
    },
    languages: [{ id: "l1", language: "english", level: "professional", read: "yes", write: "yes", speak: "no" }],
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
  assert.equal(d.academics?.degree, "B.Tech");
  assert.equal(d.academics?.branch, "CSE");
  assert.equal(d.academics?.yearOfGraduation, "2026");
  assert.equal(d.academics?.cgpa, "8.4");
  assert.equal(d.academics?.marksheetUploads?.[0].originalName, "sem6.pdf");
  assert.equal(d.languages?.[0].language, "English", "legacy lowercase names display capitalised");
  assert.equal(d.languages?.[0].level, "Professional");
  assert.equal(d.languages?.[0].speak, false);
  assert.equal(d.extracurriculars?.[0].activity, "Debate");
  assert.equal(d.bank?.ifscCode, "SBIN0001");
});

test("INT-02: a legacy \"Present\" end date reads as a current role and is written back as \"Present\"", () => {
  const d = draftFromRecord(legacyRow);
  const current = d.experiences?.[1];
  assert.equal(current?.current, true);
  assert.equal(current?.to, "");
  assert.equal(d.experiences?.[0].current, false);
  assert.equal(d.experiences?.[0].to, "2025-04-30");
  const out = storedFromDraft(d, legacyRow).experienceJson as Record<string, unknown>[];
  assert.equal(out[1].to, "Present");
  assert.equal(out[0].to, "2025-04-30");
  // An early build of this app wrote to: "" + current: true.
  const early = draftFromRecord({ experienceJson: [{ id: "x", type: "Freelance", from: "2025-01-01", to: "", current: true }] });
  assert.equal(early.experiences?.[0].current, true);
  assert.equal(early.experiences?.[0].type, "Freelancing", "INT-22: new-app types map to the legacy ones");
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
  assert.equal(a.degree, "B.Tech");
  assert.equal(a.specialization, "CSE");
  assert.equal(a.endYear, "2026");
  assert.equal(a.startYear, "2022");
  assert.deepEqual(a.professionalCourses, [{ id: "c1", level: "CA" }]);
  assert.deepEqual((a.marksheetUploads as Record<string, unknown>[])[0], {
    name: "u1.aaaaaaaaaaaaaaaaaaaaaa.pdf",
    originalName: "sem6.pdf",
    label: "sem6.pdf",
    type: "application/pdf",
    size: 10,
  });
  const l = (out.extraPatch.languages as Record<string, unknown>[])[0];
  assert.equal(l.language, "english", "INT-22: languages are stored lowercase");
  assert.equal(l.level, "professional");
  assert.equal(l.speak, "no");
  assert.ok(Array.isArray(out.extraPatch.extracurricular));
  assert.equal(out.extraPatch.extracurriculars, undefined);
});

test("languages: an early build's Conversational reads as Basic", () => {
  const d = draftFromRecord({ extraData: { languages: [{ id: "l", language: "Tamil", level: "conversational" }] } });
  assert.equal(d.languages?.[0].level, "Basic");
});

test("extracurriculars: blank rows are not saved and at most ten are kept (INT-30)", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, activity: i === 0 ? "  " : `Club ${i}`, level: "Beginner" as const }));
  const out = storedFromDraft({ extracurriculars: rows }, null).extraPatch.extracurricular as Record<string, unknown>[];
  assert.equal(out.length, 10);
  assert.equal(out[0].activity, "Club 1");
});

test("skills: duplicates differing only in case are dropped; a bare list rates Beginner", () => {
  assert.deepEqual(skillsToStore({ skills: ["React", "react ", "SQL"] }), [
    { name: "React", rating: "Beginner" },
    { name: "SQL", rating: "Beginner" },
  ]);
  const stored = storedFromDraft({ skillsWithRatings: [{ name: "Excel", rating: "Advanced" }, { name: "EXCEL", rating: "Beginner" }] }, null).skills;
  assert.equal(stored?.length, 1);
});

test("bare-string skills from early builds still read", () => {
  const d = draftFromRecord({ skills: ["Figma"], extraData: { skillsWithRatings: [{ name: "Figma", rating: "Advanced" }] } });
  assert.equal(d.skillsWithRatings?.[0].rating, "Advanced");
});

/* ── Qualifications (INT-19) ───────────────────────────────────────────── */

test("professional courses and certifications keep every legacy field", () => {
  const row = {
    extraData: {
      academics: {
        professionalCourses: [
          { id: "p1", courseNamePreset: "CA", courseNameOther: "", level: "Final", institution: "ICAI", status: "Completed", completionDate: "2024-05-01", scoreType: "percentage", score: "62", certificateUploads: [{ name: "k" }] },
          { id: "p2", courseNamePreset: "Other", courseNameOther: "ACCA", level: "Skills", institution: "ACCA", status: "Pursuing", completionDate: "", scoreType: "percentage", score: "", certificateUploads: [] },
        ],
        certifications: [{ id: "c1", certificateName: "AWS CCP", institution: "AWS", startDate: "2023-01-01", endDate: "2023-03-01", certificateUploads: [] }],
      },
    },
  };
  const d = draftFromRecord(row);
  const ca = d.academics!.professional[0];
  assert.equal(ca.preset, "CA");
  assert.equal(ca.name, "CA");
  assert.equal(ca.level, "Final");
  assert.equal(ca.status, "Completed");
  assert.equal(ca.score, "62");
  assert.equal(d.academics!.professional[1].preset, "Other");
  assert.equal(d.academics!.professional[1].name, "ACCA");
  assert.equal(d.academics!.certifications[0].startDate, "2023-01-01");
  assert.equal(d.academics!.certifications[0].completionDate, "2023-03-01");

  const out = storedFromDraft(d, row);
  const a = out.extraPatch.academics as Record<string, unknown[]>;
  assert.deepEqual(a.professionalCourses[0], row.extraData.academics.professionalCourses[0], "unchanged row is not rewritten");

  const edited = { ...d, academics: { ...d.academics!, professional: [{ ...ca, status: "Pursuing" }] } };
  const saved = (storedFromDraft(edited, row).extraPatch.academics as Record<string, Record<string, unknown>[]>).professionalCourses[0];
  assert.equal(saved.status, "Pursuing");
  assert.equal(saved.completionDate, "", "legacy clears the date while pursuing");
  assert.equal(saved.courseNamePreset, "CA");

  // A file added in the form lands in the legacy certificateUploads list.
  const file = { name: "u1.abcdefghijklmnopqrstu.pdf", originalName: "ccp.pdf", type: "application/pdf", size: 1200 };
  const withFile = { ...d, academics: { ...d.academics!, certifications: [{ ...d.academics!.certifications[0], uploads: [file] }] } };
  const cert = (storedFromDraft(withFile, row).extraPatch.academics as Record<string, Record<string, unknown>[]>).certifications[0];
  assert.deepEqual(cert.certificateUploads, [file]);
  assert.equal(cert.startDate, "2023-01-01");

  assert.ok(storedFileNames(row.extraData.academics).has("k"));
});

test("emergency contact and score type read from legacy keys", () => {
  const d = draftFromRecord({ extraData: { emergencyCountryCode: "+44", emergencyPhone: "7700900123", emergencyContactName: "Asha", academics: { score: "84" } } });
  assert.equal(d.emergencyCountryCode, "+44");
  assert.equal(d.emergencyName, "Asha");
  assert.equal(d.academics?.scoreType, "percentage", "a score over 10 with no type is a percentage");
  assert.equal(draftFromRecord({ extraData: { academics: {} } }).academics?.scoreType, "", "nothing preselected");
});

test("dates: month-only and free-text rows read as the 1st; labels are DD/MM/YYYY", () => {
  assert.equal(toMonth("Jan 2025"), "2025-01");
  assert.equal(toMonth("September 2024"), "2024-09");
  assert.equal(toMonth("2025-03-15"), "2025-03");
  assert.equal(toMonth("03/2025"), "2025-03");
  assert.equal(toMonth("sometime"), "sometime");
  assert.equal(monthLabel("2025-01"), "Jan 2025");
  assert.equal(toDay("2025-03-15"), "2025-03-15");
  assert.equal(toDay("2025-01"), "2025-01-01");
  assert.equal(toDay(""), "");
  assert.equal(dateLabel("2025-03-15"), "15/03/2025");
  assert.ok(isRealDay("2024-02-29"));
  assert.ok(!isRealDay("2025-02-29"));
  assert.ok(!isRealDay("15/03/2025"));
});

test("INT-18: degrees use the legacy list for the level, in legacy spelling", () => {
  assert.equal(degreeOption("BSc", "Bachelor's"), "BSc");
  assert.equal(degreeOption("B.Sc", "Bachelor's"), "BSc");
  assert.equal(degreeOption("B.Tech / B.E.", "Bachelor's"), "B.Tech", "what an early build stored");
  assert.equal(degreeOption("BE", "Bachelor's"), "B.Tech");
  assert.equal(degreeOption("M.A.", "Master's"), "MA");
  assert.equal(degreeOption("PGDM", "Master's"), "PGDM");
  assert.equal(degreeOption("B.Arch", "Bachelor's"), "Other");
  assert.equal(degreeOption("", "Bachelor's"), "");
  assert.equal(canonicalDegree("B.A.", "Bachelor's"), "BA");
  assert.equal(canonicalDegree("Polytechnic in Civil", "Diploma"), "Polytechnic in Civil", "diploma is typed");
  assert.equal(draftFromRecord({ extraData: { academics: { level: "bachelors", degree: "B.Tech / B.E." } } }).academics?.degree, "B.Tech");
});

/* ── Validation ────────────────────────────────────────────────────────── */

const NOW = new Date("2026-10-19T00:00:00Z");

function complete(): OnboardingDraft {
  const d = emptyDraft();
  return {
    ...d,
    bio: "",
    city: "Jaipur",
    state: "Rajasthan",
    pinCode: "302017",
    linkedinUrl: "https://www.linkedin.com/in/someone",
    aadhaarNumber: "234567890123",
    panNumber: "ABCDE1234F",
    emergencyCountryCode: "+91",
    emergencyPhone: "9812345670",
    academics: {
      ...d.academics,
      qualificationLevel: "Bachelor's",
      status: "Pursuing",
      institution: "MNIT",
      degree: "B.Tech",
      branch: "Computer Science",
      startYear: "2022",
      yearOfGraduation: "2027",
      scoreType: "cgpa",
      cgpa: "8.4",
    },
    skills: ["React", "SQL", "Sales", "Excel"],
    locationTypes: ["remote"],
    hasLaptop: true,
    ndaAccepted: true,
  };
}
const ctx = { hasPanImage: true, hasAadhaarImage: true, hasPhoto: true, now: NOW };

test("a complete profile passes every step; bio is optional (INT-20)", () => {
  assert.equal(validateProfile(complete(), ctx), null);
  assert.equal(firstOpenStep(complete(), ctx, 8), 8);
});

test("Aadhaar number and PAN image are required; the Aadhaar image is optional (bug sheet 8)", () => {
  const e = validateStep({ ...complete(), aadhaarNumber: "" }, 0, { ...ctx, hasPanImage: false, hasAadhaarImage: false });
  assert.ok(e.aadhaarNumber);
  assert.ok(e.panImage);
  assert.equal(e.aadhaarImage, undefined);
  assert.match(validateStep({ ...complete(), aadhaarNumber: "12345" }, 0, ctx).aadhaarNumber, /12 digits/);
  assert.ok(validateStep({ ...complete(), aadhaarNumber: "123456789012" }, 0, ctx).aadhaarNumber, "cannot start with 1");
  assert.equal(
    validateStep({ ...complete(), aadhaarNumber: "123456789012" }, 0, { ...ctx, storedAadhaar: "123456789012" }).aadhaarNumber,
    undefined,
    "a legacy number already stored is not re-judged (INT-30)",
  );
});

test("emergency contact: a valid Indian number, not your own (INT-40)", () => {
  const e = validateStep({ ...complete(), emergencyName: "", emergencyPhone: "12345" }, 0, ctx);
  assert.equal(e.emergencyName, undefined);
  assert.ok(e.emergencyPhone);
  assert.match(validateStep({ ...complete(), emergencyCountryCode: "+44", emergencyPhone: "7700900123" }, 0, ctx).emergencyPhone, /\+91/);
  const own = { countryCode: "+91", phoneNumber: "9812345670" };
  assert.match(validateStep(complete(), 0, { ...ctx, ownPhone: own }).emergencyPhone, /your own/);
});

test("INT-39: the account's own number must be valid to submit", () => {
  assert.ok(validateStep(complete(), 0, { ...ctx, ownPhone: null }).ownPhone);
  assert.ok(validateStep(complete(), 0, { ...ctx, ownPhone: { countryCode: "+91", phoneNumber: "0000000000" } }).ownPhone);
  assert.equal(validateStep(complete(), 0, { ...ctx, ownPhone: { countryCode: "+91", phoneNumber: "9876501234" } }).ownPhone, undefined);
});

test("bank details are not part of onboarding (bug sheet 8)", () => {
  const empty = { accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "", upiId: "" };
  assert.deepEqual(validateStep({ ...complete(), bank: { ...empty, bankName: "State Bank of India" } }, 0, ctx), {});
});

test("LinkedIn is optional; a given link must be a LinkedIn profile (legacy pattern)", () => {
  assert.equal(validateStep({ ...complete(), linkedinUrl: "" }, 0, ctx).linkedinUrl, undefined);
  assert.equal(validateStep({ ...complete(), linkedinUrl: "linkedin.com/in/me" }, 0, ctx).linkedinUrl, undefined);
  assert.ok(validateStep({ ...complete(), linkedinUrl: "https://github.com/me" }, 0, ctx).linkedinUrl);
  assert.ok(validateStep({ ...complete(), linkedinUrl: "https://evil.com/linkedin.com/x" }, 0, ctx).linkedinUrl);
});

test("state, city and PIN are required", () => {
  const e = validateStep({ ...complete(), state: "", city: "", pinCode: "" }, 0, ctx);
  assert.ok(e.state && e.city && e.pinCode);
});

test("academics: level and status are chosen, nothing preselected (INT-30)", () => {
  const base = complete();
  const e = validateStep({ ...base, academics: { ...base.academics, qualificationLevel: "", status: "" } }, 1, ctx);
  assert.ok(e.qualificationLevel);
  assert.ok(e.academicStatus);
  assert.equal(emptyDraft().academics.status, "");
  assert.equal(emptyDraft().academics.scoreType, "");
});

test("INT-17: score needed only once completed, never for a Ph.D", () => {
  const base = complete();
  const pursuing = validateStep({ ...base, academics: { ...base.academics, cgpa: "", scoreType: "" } }, 1, ctx);
  assert.equal(pursuing.cgpa, undefined);
  const done = validateStep({ ...base, academics: { ...base.academics, status: "Completed", yearOfGraduation: "2026", cgpa: "" } }, 1, ctx);
  assert.ok(done.cgpa);
  const phd = validateStep({ ...base, academics: { ...base.academics, qualificationLevel: "Ph.D", degree: "Physics", status: "Completed", yearOfGraduation: "2026", cgpa: "" } }, 1, ctx);
  assert.equal(phd.cgpa, undefined);
  assert.ok(validateStep({ ...base, academics: { ...base.academics, scoreType: "", cgpa: "8" } }, 1, ctx).scoreType);
});

test("INT-17: years - end optional while pursuing (this year to +6), start before end", () => {
  const base = complete();
  const y = (patch: Partial<OnboardingDraft["academics"]>) => validateStep({ ...base, academics: { ...base.academics, ...patch } }, 1, ctx).yearOfGraduation;
  assert.equal(y({ yearOfGraduation: "" }), undefined);
  assert.ok(y({ yearOfGraduation: "2025" }), "pursuing cannot end in the past");
  assert.ok(y({ yearOfGraduation: "2033" }), "at most six years on");
  assert.equal(y({ yearOfGraduation: "2032" }), undefined);
  assert.ok(y({ status: "Completed", yearOfGraduation: "2027" }), "completed cannot end in the future");
  assert.ok(y({ status: "Completed", yearOfGraduation: "" }));
  assert.ok(y({ status: "Completed", startYear: "2024", yearOfGraduation: "2024", cgpa: "8" }), "start must be before end");
});

test("CGPA is capped at 10 and percentage at 100", () => {
  const base = complete();
  const cgpa = validateStep({ ...base, academics: { ...base.academics, scoreType: "cgpa", cgpa: "10.5" } }, 1, ctx);
  assert.match(cgpa.cgpa, /0 to 10/);
  const pct = validateStep({ ...base, academics: { ...base.academics, scoreType: "percentage", cgpa: "101" } }, 1, ctx);
  assert.match(pct.cgpa, /100/);
  assert.equal(scoreProblem("cgpa", "10"), null);
});

test("degree: Other needs a typed name; Diploma and Ph.D are typed", () => {
  const base = complete();
  assert.ok(validateStep({ ...base, academics: { ...base.academics, degree: "Other" } }, 1, ctx).degree);
  assert.equal(validateStep({ ...base, academics: { ...base.academics, degree: "B.Arch" } }, 1, ctx).degree, undefined);
  assert.ok(validateStep({ ...base, academics: { ...base.academics, qualificationLevel: "Diploma", degree: "" } }, 1, ctx).degree);
});

test("INT-19: professional and certification rows need the legacy fields", () => {
  const base = complete();
  const prof = { id: "q1", preset: "CA", name: "CA", level: "", status: "Completed", issuer: "", completionDate: "2030-01-01", credentialUrl: "", scoreType: "percentage" as const, score: "" };
  const e = validateStep({ ...base, academics: { ...base.academics, professional: [prof] } }, 1, ctx);
  assert.ok(e["professional.q1.level"]);
  assert.ok(e["professional.q1.issuer"]);
  assert.match(e["professional.q1.completionDate"], /future/);
  assert.ok(e["professional.q1.score"]);
  const pursuing = validateStep({ ...base, academics: { ...base.academics, professional: [{ ...prof, level: "Final", issuer: "ICAI", status: "Pursuing", completionDate: "" }] } }, 1, ctx);
  assert.deepEqual(pursuing, {}, "no date or score while pursuing");

  const cert = { id: "c1", name: "AWS", issuer: "AWS", startDate: "", completionDate: "2025-01-01", credentialUrl: "" };
  assert.ok(validateStep({ ...base, academics: { ...base.academics, certifications: [cert] } }, 1, ctx)["certifications.c1.startDate"]);
  const backwards = validateStep({ ...base, academics: { ...base.academics, certifications: [{ ...cert, startDate: "2025-02-01" }] } }, 1, ctx);
  assert.match(backwards["certifications.c1.completionDate"], /before the start/);
});

test("experience: every field required, description any length (INT-30)", () => {
  const exp = { id: "e1", type: "", company: "", role: "", from: "", to: "", current: false, description: "" };
  const e = validateStep({ ...complete(), experiences: [exp] }, 2, ctx);
  for (const f of ["type", "company", "role", "from", "to", "description"]) assert.ok(e[`exp.e1.${f}`], f);

  const ongoing = { ...exp, type: "Job", company: "Acme", role: "Intern", from: "2026-06-10", current: true, description: "Ops." };
  assert.deepEqual(validateStep({ ...complete(), experiences: [ongoing] }, 2, ctx), {}, "no end date needed while current");
  assert.match(validateStep({ ...complete(), experiences: [{ ...ongoing, current: false, to: "2026-06-01" }] }, 2, ctx)["exp.e1.to"], /before the start/);
  assert.match(validateStep({ ...complete(), experiences: [{ ...ongoing, from: "2026-02-30" }] }, 2, ctx)["exp.e1.from"], /real date/);
  assert.deepEqual(validateStep({ ...complete(), experiences: [] }, 2, ctx), {}, "experience itself stays optional");
});

test("skills: 4 to 7, counted case-insensitively", () => {
  assert.ok(validateStep({ ...complete(), skills: ["A", "a", "B", "C"] }, 3, ctx).skills);
  assert.ok(validateStep({ ...complete(), skills: ["A", "B", "C", "D", "E", "F", "G", "H"] }, 3, ctx).skills);
});

test("languages: at least one, each named and levelled, no repeats (INT-22)", () => {
  const l = (id: string, language: string, level: "Native" | "") => ({ id, language, level, read: true, write: true, speak: true });
  assert.ok(validateStep({ ...complete(), languages: [] }, 4, ctx).languages);
  const e = validateStep({ ...complete(), languages: [l("a", "Hindi", "Native"), l("b", "hindi", ""), l("c", "", "Native")] }, 4, ctx);
  assert.ok(e["lang.b.language"]);
  assert.ok(e["lang.b.level"]);
  assert.ok(e["lang.c.language"]);
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
  assert.deepEqual(validateStep({ ...base, locationTypes: ["remote", "hybrid"], preferredLocations: ["Jaipur, Rajasthan"] }, 6, ctx), {});
  assert.deepEqual(validateStep({ ...base, locationTypes: ["remote"], preferredLocations: [] }, 6, ctx), {});
  assert.ok(validateStep({ ...base, locationTypes: ["remote"], preferredLocations: ["a", "b", "c", "d", "e", "f"] }, 6, ctx).preferredLocations);
});

test("bank details are required in full when saved", () => {
  const bank = { accountHolderName: "Asha", bankName: "SBI", accountNumber: "123456789012", ifscCode: "SBIN0001234", upiId: "" };
  assert.equal(bankProblem(bank), null);
  assert.ok(bankProblem({ ...bank, accountHolderName: "" }));
  assert.ok(bankProblem({ ...bank, accountNumber: "12ab" }));
  assert.ok(bankProblem({ ...bank, ifscCode: "SBIN1234" }));
  assert.ok(bankProblem({ ...bank, upiId: "not-a-upi" }));
});

test("draft saves only refuse impossible values", () => {
  assert.equal(formatProblems({ bio: "" }), null);
  assert.ok(formatProblems({ academics: { scoreType: "cgpa", cgpa: "42" } }));
});

test("one work mode is shown: the widest stored", () => {
  assert.equal(widestWorkMode(["remote", "hybrid", "onsite"]), "onsite");
  assert.equal(widestWorkMode(["Remote", "On-site"]), "onsite");
  assert.equal(widestWorkMode([]), null);
});

/* ── Completion and the INT-04 rule ────────────────────────────────────── */

const storedComplete = {
  city: "Jaipur",
  state: "Rajasthan",
  pinCode: "302017",
  aadhaarNumber: "234567890123",
  panNumber: "ABCDE1234F",
  skills: ["A", "B", "C", "D"],
  locationTypes: ["remote"],
  hasLaptop: true,
  extraData: {
    emergencyPhone: "9812345670",
    ndaAcceptedAt: "2026-10-01T00:00:00Z",
    languages: [{ id: "l", language: "english", level: "native" }],
    academics: { level: "bachelors", status: "Pursuing", institution: "MNIT", degree: "B.Tech", startYear: "2022" },
  },
};
const allDocs = { hasPanImage: true, hasAadhaarImage: true, hasPhoto: true };

test("profile completion: bio optional, PAN image required, Aadhaar image optional, 4 skills", () => {
  assert.equal(profileCompletion(storedComplete, allDocs).complete, true);
  const identity = (docs: Partial<typeof allDocs>) => profileCompletion(storedComplete, { ...allDocs, ...docs }).items.find((i) => i.id === "identity")?.done;
  assert.equal(identity({ hasAadhaarImage: false }), true);
  assert.equal(identity({ hasPanImage: false }), false);
  assert.equal(profileCompletion({ ...storedComplete, skills: ["A", "B", "C"] }, allDocs).complete, false);
});

test("INT-04: a submitted, complete or scored profile counts as onboarded; a first draft does not", () => {
  assert.equal(isOnboarded(null, allDocs), false);
  assert.equal(isOnboarded({ city: "Jaipur", extraData: {} }, allDocs), false);
  assert.equal(isOnboarded({ city: "Jaipur", extraData: { profileSubmittedAt: "2026-10-01" } }, allDocs), true);
  assert.equal(isOnboarded({ extraData: { findternScore: 6.2 } }, allDocs), true);
  assert.equal(isOnboarded(storedComplete, allDocs), true);
});

/* ── Skills lock (INT-03 / INT-30) ─────────────────────────────────────── */

test("skills lock: admin ratings lock; a stale AI invite does not", () => {
  assert.equal(hasAssessmentRating({ ratings: { interview: 7 } }), true);
  assert.equal(hasAssessmentRating({ ratings: { mood: 7 } }), false);
  const now = new Date("2026-10-20T10:00:00Z");
  const past = new Date("2026-10-19T10:00:00Z");
  const future = new Date("2026-10-21T10:00:00Z");
  assert.equal(aiInviteHoldsSkills({ status: "sent", selectedSlot: null, slot1: past, slot2: past, slot3: null }, now), false, "every slot passed: expired");
  assert.equal(aiInviteHoldsSkills({ status: "sent", selectedSlot: null, slot1: past, slot2: future, slot3: null }, now), true);
  assert.equal(aiInviteHoldsSkills({ status: "scheduled", selectedSlot: 1, slot1: past, slot2: null, slot3: null }, now), false, "picked slot over: completed");
  assert.equal(aiInviteHoldsSkills({ status: "scheduled", selectedSlot: 1, slot1: future, slot2: null, slot3: null }, now), true);
  assert.equal(aiInviteHoldsSkills({ status: "pending", selectedSlot: null, slot1: null, slot2: null, slot3: null }, now), true, "queued, no slots yet");
  assert.equal(aiInviteHoldsSkills({ status: "completed", selectedSlot: 1, slot1: future, slot2: null, slot3: null }, now), false);
  assert.equal(sameRatedSkills([{ name: "React", rating: "Advanced" }], [{ name: "react", rating: "Advanced" }]), true);
  assert.equal(sameRatedSkills([{ name: "React", rating: "Advanced" }], [{ name: "React", rating: "Beginner" }]), false);
});

/* ── Data helpers ──────────────────────────────────────────────────────── */

test("skill suggestions mix technical and non-technical (NC r19)", () => {
  const first = SUGGESTED_SKILLS.slice(0, 9);
  assert.ok(first.some((s) => TECH_SKILLS.includes(s)));
  assert.ok(first.some((s) => NON_TECH_SKILLS.includes(s)));
  assert.equal(new Set(SUGGESTED_SKILLS).size, TECH_SKILLS.length + NON_TECH_SKILLS.length);
});

test("did you mean: close misspellings get the known skill (INT-30)", () => {
  assert.equal(didYouMean("Pyhton"), "Python");
  assert.equal(didYouMean("Python"), null, "already a known skill");
  assert.equal(didYouMean("Pyhton", ["Python"]), null, "already picked");
  assert.equal(didYouMean("ab"), null);
});

test("city dropdown lists one state's districts", () => {
  const rj = districtsOf("Rajasthan");
  assert.ok(rj.includes("Jaipur"));
  assert.ok(!rj.includes("Pune"));
  assert.deepEqual(districtsOf(""), []);
});
