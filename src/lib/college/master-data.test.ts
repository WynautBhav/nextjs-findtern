import { test } from "node:test";
import assert from "node:assert/strict";

import { buildMasterRow, cellText, matchesOutcome, csvCell, MASTER_COLUMNS, matchesWorkMode, toCsv, type MasterExtras, type ScopedStudent } from "./master-row.ts";
import { quadrantOf } from "./insights.ts";

const student = (over: Partial<ScopedStudent> = {}): ScopedStudent => ({
  userId: "u1", status: "verified", firstName: "Asha", lastName: "Meena", email: "asha@jklu.edu.in",
  phone: "+91 98290 00000", linkedin: "https://linkedin.com/in/asha", year: 3, branch: "Finance", cgpa: 6.4, score: 8.2,
  lastSeenAt: new Date("2026-11-22T10:00:00Z"), openToWork: true, ...over,
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
  hasLaptop: true, city: "Jaipur", state: "Rajasthan", experience: [{}], offers: 0, offersAccepted: 0, offersRejected: 0, offersLapsed: 0, offersOpen: 0, hired: 0, ppo: 0, internship: 0, ppoDirect: 0, ppoAfter: 0, earningsMinor: 0, meetings: { total: 0, done: 0, missed: 0, calledOff: 0, withdrawn: 0, notAccepted: 0, upcoming: 0, waiting: 0, notClosed: 0, notJoined: 0, callsAccepted: 0, callsNotTaken: 0, callsWaiting: 0 }, ...over,
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
  const r = buildMasterRow(student({ status: "claimed", phone: null, linkedin: null, cgpa: null, score: null }), extras({ offers: 3, hired: 1, ppo: 1, earningsMinor: 50000, meetings: { total: 4, done: 2, missed: 0, calledOff: 0, withdrawn: 0, notAccepted: 1, upcoming: 1, waiting: 0, notClosed: 0, notJoined: 0, callsAccepted: 0, callsNotTaken: 0, callsWaiting: 0 } }));
  assert.equal(r.verified, false);
  assert.equal(r.meetings.total, 0);
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

test("quadrants split on a strong Findtern score and a high CGPA", () => {
  assert.equal(quadrantOf({ cgpa: 8.0, score: 8.0 }), "stars");
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

test("open to work: the student's own switch, shown only once the officer accepts them", () => {
  assert.equal(buildMasterRow(student(), extras()).openToWork, true);
  assert.equal(buildMasterRow(student({ openToWork: false }), extras()).openToWork, false);
  assert.equal(buildMasterRow(student({ status: "claimed", openToWork: false }), extras()).openToWork, null);
});

test("meetings missed and offer replies show per student, deadline missed apart from rejected", () => {
  const r = buildMasterRow(student(), extras({ offers: 5, offersAccepted: 1, offersRejected: 1, offersLapsed: 2, offersOpen: 1, meetings: { total: 3, done: 1, missed: 2, calledOff: 0, withdrawn: 0, notAccepted: 0, upcoming: 0, waiting: 0, notClosed: 0, notJoined: 0, callsAccepted: 0, callsNotTaken: 0, callsWaiting: 0 } }));
  assert.equal(cellText(r, "meetingsMissed"), "2");
  assert.equal(cellText(r, "offerReplies"), "1 accepted · 1 rejected · 2 deadline missed · 1 waiting");
  assert.equal(cellText(buildMasterRow(student(), extras()), "offerReplies"), "");
  assert.equal(cellText(buildMasterRow(student({ status: "claimed" }), extras({ offers: 2, offersLapsed: 2 })), "offerReplies"), "");
});

test("every student in a drive call is reachable by one drive-call filter, and a booked meeting nobody closed is not 'didn't accept'", () => {
  const m = (over: Partial<MasterExtras["meetings"]>) => buildMasterRow(student(), extras({ meetings: { total: 0, done: 0, missed: 0, calledOff: 0, withdrawn: 0, notAccepted: 0, upcoming: 0, waiting: 0, notClosed: 0, notJoined: 0, callsAccepted: 0, callsNotTaken: 0, callsWaiting: 0, ...over } }));
  for (const [over, key] of [[{ callsAccepted: 1 }, "call-took"], [{ callsWaiting: 1 }, "call-waiting"], [{ callsNotTaken: 1 }, "call-not-taken"]] as const) {
    assert.equal(matchesOutcome(m(over), key), true, key);
    assert.equal(cellText(m(over), "driveCalls") !== "", true);
  }
  // Booked for a past slot and never closed: its own outcome (meet-outcome.ts not_closed), not "didn't accept".
  assert.equal(matchesOutcome(m({ total: 1, notClosed: 1 }), "meet-other"), true);
  assert.equal(matchesOutcome(m({ total: 1, notClosed: 1 }), "not-accepted"), false);
});

test("missed, called off and withdrawn meetings each have their own filter and are not 'not closed' (26 Nov)", () => {
  const m = (over: Partial<MasterExtras["meetings"]>) => buildMasterRow(student(), extras({ meetings: { total: 0, done: 0, missed: 0, calledOff: 0, withdrawn: 0, notAccepted: 0, upcoming: 0, waiting: 0, notClosed: 0, notJoined: 0, callsAccepted: 0, callsNotTaken: 0, callsWaiting: 0, ...over } }));
  for (const [over, key] of [[{ total: 1, missed: 1 }, "meet-missed"], [{ total: 1, calledOff: 1 }, "meet-called-off"], [{ total: 1, withdrawn: 1 }, "meet-withdrawn"]] as const) {
    assert.equal(matchesOutcome(m(over), key), true, key);
    assert.equal(matchesOutcome(m(over), "meet-other"), false, `${key} is not 'not closed'`);
    assert.equal(matchesOutcome(m(over), "not-accepted"), false, `${key} is not 'not accepted'`);
  }
});

// SYNC-01 / SYNC-02 (data-sync audit): what the student typed must reach the TPO's list.
test("skills saved by the onboarding form ({id,name,rating} objects) reach the master data row and CSV", () => {
  const r = buildMasterRow(student(), extras({ skills: [{ id: "skill-1", name: "SQL", rating: 2 }, { id: "skill-2", name: "Python", rating: 2 }, "Excel"] }));
  assert.deepEqual(r.skills, ["SQL", "Python", "Excel"]);
  assert.equal(cellText(r, "skills"), "SQL, Python, Excel");
});

test("a verified student with no onboarding record still shows the phone and LinkedIn the Students page shows", () => {
  const r = buildMasterRow(student(), undefined);
  assert.equal(r.phone, "+91 98290 00000");
  assert.equal(r.linkedin, "https://linkedin.com/in/asha");
  assert.equal(buildMasterRow(student({ status: "claimed" }), undefined).phone, null, "an unverified student keeps only name/email/year/course/branch");
});
