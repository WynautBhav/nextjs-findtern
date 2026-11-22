import { test } from "node:test";
import assert from "node:assert/strict";

import { buildMasterRow, cellText, csvCell, MASTER_COLUMNS, matchesWorkMode, toCsv, type MasterExtras, type ScopedStudent } from "./master-row.ts";
import { computeInsights, quadrantOf } from "./insights.ts";

const student = (over: Partial<ScopedStudent> = {}): ScopedStudent => ({
  userId: "u1", status: "verified", firstName: "Asha", lastName: "Meena", email: "asha@jklu.edu.in",
  phone: "+91 98290 00000", linkedin: "https://linkedin.com/in/asha", year: 3, branch: "Finance", cgpa: 6.4, score: 8.2,
  lastSeenAt: new Date("2026-11-22T10:00:00Z"), ...over,
});

const extras = (over: Partial<MasterExtras> = {}): MasterExtras => ({
  extra: {
    academics: { degree: "BBA", startYear: "2024", endYear: "2027", currentSemester: 5, certifications: [{}, {}], professional: [{ name: "CFA Level 1", status: "pursuing", level: "Level 1" }] },
    ratings: { communication: 8.8, coding: 4.1, aptitude: 7.9, interview: 8.0 },
    emergencyName: "Sunita Meena", emergencyRelation: "Mother", emergencyCountryCode: "+91", emergencyPhone: "9800000000",
    aiFeedbackLink: "https://x.test/r", aiRecordingLink: "https://x.test/v",
    aadhaarNumber: "1234 5678 9012", panNumber: "ABCDE1234F", bank: { accountNumber: "000111" },
  },
  skills: ["Excel", "Sales"], locationTypes: ["Hybrid", "remote", "space"], preferredLocations: ["Jaipur", "Delhi"],
  hasLaptop: true, city: "Jaipur", state: "Rajasthan", experience: [{}], offers: 0, hired: 0, ppo: 0, earningsMinor: 0, ...over,
});

test("a verified student carries every field on the master data list", () => {
  const r = buildMasterRow(student(), extras());
  assert.equal(r.degree, "BBA");
  assert.equal(r.startYear, 2024);
  assert.equal(r.endYear, 2027);
  assert.equal(r.semester, 5);
  assert.equal(r.professionalCourse, "CFA Level 1");
  assert.equal(r.professionalStatus, "Pursuing");
  assert.equal(r.certifications, 2);
  assert.equal(r.experience, 1);
  // The student's own pick: the widest mode stored (Findtern's onboarding rule).
  assert.equal(r.workMode, "hybrid");
  assert.equal(cellText(r, "workMode"), "Hybrid");
  assert.equal(r.english, 8.8);
  assert.equal(r.emergencyContact, "Sunita Meena (Mother) +91 9800000000");
  assert.equal(r.hasReport, true);
  assert.equal(r.city, "Jaipur, Rajasthan");
  assert.equal(cellText({ ...r, cgpa: 6 }, "cgpa"), "6.0");
  assert.equal(cellText(r, "semester"), "5");
});

test("an unverified student shows only name, email, year, course and branch", () => {
  const r = buildMasterRow(student({ status: "claimed", phone: null, linkedin: null, cgpa: null, score: null }), extras({ offers: 3, hired: 1, ppo: 1, earningsMinor: 50000 }));
  assert.equal(r.verified, false);
  for (const k of ["phone", "emergencyContact", "cgpa", "score", "english", "city", "laptop", "lastSeenAt", "professionalCourse"] as const) {
    assert.equal(r[k], null, k);
  }
  assert.deepEqual([r.offers, r.hired, r.ppo, r.earningsMinor, r.hasReport, r.skills.length], [0, false, false, 0, false, 0]);
  // Blank in the export too, never "No" or "0", which would read as a real fact.
  assert.equal(cellText(r, "hired"), "");
  assert.equal(cellText(r, "offers"), "");
});

test("Aadhaar, PAN and bank never reach a row, a cell or the CSV", () => {
  const r = buildMasterRow(student(), extras());
  const csv = toCsv([r], MASTER_COLUMNS.map((c) => c.key), "https://findtern.in");
  for (const secret of ["1234 5678 9012", "ABCDE1234F", "000111", "x.test"]) assert.ok(!csv.includes(secret), secret);
  // Report and recording go through the audited route, never the raw link.
  assert.ok(csv.includes("https://findtern.in/api/college/students/u1/report"));
});

test("CSV cells cannot run as spreadsheet formulas", () => {
  assert.equal(csvCell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`);
  for (const bad of ["+1", "-2", "@SUM(A1)", "\tx"]) assert.ok(csvCell(bad).startsWith(`"'`), bad);
  assert.equal(csvCell("Jaipur, Delhi"), '"Jaipur, Delhi"');
});

test("course totals add up to the batch, and claimed students are left out", () => {
  const rows = [
    buildMasterRow(student({ userId: "a" }), extras({ offers: 2, hired: 1, ppo: 1, earningsMinor: 200000 })),
    buildMasterRow(student({ userId: "b", score: 5.1 }), extras({ offers: 1 })),
    buildMasterRow(student({ userId: "c", cgpa: 8.9, score: 6.0 }), extras({ extra: { academics: { degree: "B.Tech" } } })),
    buildMasterRow(student({ userId: "d", status: "claimed" }), extras({ offers: 9 })),
  ];
  const ins = computeInsights(rows);
  assert.equal(ins.verified, 3);
  assert.equal(ins.courses.reduce((t, c) => t + c.students, 0), ins.totals.students);
  assert.equal(ins.courses.reduce((t, c) => t + c.offers, 0), 3);
  assert.equal(ins.courses[0].course, "BBA");
  assert.equal(ins.totals.earningsMinor, 200000);
  assert.equal(ins.offerSpread.reduce((a, b) => a + b, 0), ins.totals.interviewed);
  assert.equal(ins.quadrants.reduce((t, q) => t + q.students, 0), 3);
});

test("overlooked means a strong Findtern score and no offer yet", () => {
  const rows = [
    buildMasterRow(student({ userId: "a", score: 8.5 }), extras({ offers: 0 })),
    buildMasterRow(student({ userId: "b", score: 8.9 }), extras({ offers: 1 })),
    buildMasterRow(student({ userId: "c", score: 6.9 }), extras({ offers: 0 })),
  ];
  assert.deepEqual(computeInsights(rows).overlooked.map((r) => r.userId), ["a"]);
  assert.equal(quadrantOf({ cgpa: 6.0, score: 8.0 }), "scoreBeatsCg");
  assert.equal(quadrantOf({ cgpa: 9.0, score: 5.0 }), "cgBeatsScore");
  assert.equal(quadrantOf({ cgpa: null, score: 5.0 }), null);
});

test("a student's pick is their widest stored mode", () => {
  const pick = (stored: string[]) => buildMasterRow(student(), extras({ locationTypes: stored })).workMode;
  assert.equal(pick(["remote"]), "remote");
  assert.equal(pick(["remote", "hybrid"]), "hybrid");
  assert.equal(pick(["remote", "hybrid", "onsite"]), "onsite");
  assert.equal(pick([]), null);
});

test("the filter follows Findtern's rule: Remote = remote only, Hybrid = remote + hybrid, Onsite = all three", () => {
  const shown = (selected: string) => ["remote", "hybrid", "onsite", null].filter((p) => matchesWorkMode(p, selected));
  assert.deepEqual(shown("remote"), ["remote"]);
  assert.deepEqual(shown("hybrid"), ["remote", "hybrid"]);
  assert.deepEqual(shown("onsite"), ["remote", "hybrid", "onsite"]);
  // No filter shows everyone, including students who never picked.
  assert.deepEqual(shown(""), ["remote", "hybrid", "onsite", null]);
});

test("roll number is not part of master data", () => {
  assert.ok(!MASTER_COLUMNS.some((c) => (c.key as string) === "rollNo"));
  assert.ok(!("rollNo" in buildMasterRow(student(), extras())));
});
