import assert from "node:assert/strict";
import { test } from "node:test";

import { academicsProblems, firstProblem, mergeAcademics, readAcademicsValues, type AcademicsValues } from "./academics-edit.ts";

const NOW = new Date("2026-11-18T10:00:00+05:30");

/** The production intern's record: Ph.D, completed, no score, plus keys the editor does not own. */
const prodExtra = {
  findternScore: 7.3,
  approvalStatus: "Approved",
  academics: {
    level: "phd",
    degree: "cvb b",
    institution: "cbgh",
    status: "Completed",
    startYear: 2022,
    endYear: 2026,
    score: "",
    scoreType: "",
    certifications: [{ id: "c1", name: "Keep this cert" }],
    professionalCourses: [{ id: "p1", name: "CA" }],
    marksheetUploads: [{ name: "m.pdf", type: "application/pdf", size: 10 }],
  },
};

const bachelors: AcademicsValues = {
  qualificationLevel: "Bachelor's",
  degree: "B.Tech",
  branch: "CSE",
  institution: "IIT Bombay",
  status: "Completed",
  startYear: "2021",
  yearOfGraduation: "2025",
  scoreType: "cgpa",
  score: "8.1",
};
const problems = (edit: Partial<AcademicsValues>, current = bachelors) => academicsProblems(current, edit, NOW);

test("reads the stored record the way the intern's own profile does (numbers become text, level becomes its label)", () => {
  assert.deepEqual(readAcademicsValues(prodExtra), {
    qualificationLevel: "Ph.D",
    degree: "cvb b",
    branch: "",
    institution: "cbgh",
    status: "Completed",
    startYear: "2022",
    yearOfGraduation: "2026",
    scoreType: "",
    score: "",
  });
});

test("CGPA is 0 to 10, percentage 0 to 100, numbers only", () => {
  assert.deepEqual(problems({ score: "8.4" }), {});
  assert.deepEqual(problems({ score: "10" }), {});
  assert.deepEqual(problems({ score: "0" }), {});
  assert.match(problems({ score: "10.1" }).score ?? "", /out of 10/);
  assert.match(problems({ score: "-1" }).score ?? "", /between 0 and 10/);
  assert.match(problems({ score: "eight" }).score ?? "", /Enter a number/);
  assert.deepEqual(problems({ scoreType: "percentage", score: "84" }), {});
  assert.deepEqual(problems({ scoreType: "percentage", score: "100" }), {});
  assert.match(problems({ scoreType: "percentage", score: "101" }).score ?? "", /more than 100/);
  // 84 is a fine percentage and not a CGPA: switching the type alone judges the stored score again.
  assert.match(problems({ score: "84" }).score ?? "", /out of 10/);
  assert.match(problems({ scoreType: "cgpa" }, { ...bachelors, scoreType: "percentage", score: "84" }).score ?? "", /out of 10/);
});

test("a score needs its type; no score at all is allowed even when Completed (admin leniency)", () => {
  assert.match(problems({ scoreType: "" }).scoreType ?? "", /Choose CGPA or percentage/);
  assert.deepEqual(problems({ score: "", scoreType: "" }), {});
  assert.deepEqual(problems({ score: "" }), {});
});

test("typing only a score on a record with no score type asks for the type (the type is judged whenever the score is touched)", () => {
  const noType = { ...bachelors, scoreType: "" as const, score: "" };
  assert.match(problems({ score: "8" }, noType).scoreType ?? "", /Choose CGPA or percentage/);
  assert.deepEqual(problems({ score: "8", scoreType: "cgpa" }, noType), {});
});

test("a Ph.D takes a score with the same rules as any degree", () => {
  assert.deepEqual(problems({ qualificationLevel: "Ph.D" }), {});
  assert.deepEqual(problems({ qualificationLevel: "Ph.D", score: "", scoreType: "" }), {});
  assert.deepEqual(problems({ score: "8", scoreType: "cgpa" }, { ...bachelors, qualificationLevel: "Ph.D", scoreType: "", score: "" }), {});
  assert.match(problems({ score: "11", scoreType: "cgpa" }, { ...bachelors, qualificationLevel: "Ph.D", scoreType: "", score: "" }).score ?? "", /out of 10/);
});

test("years follow the onboarding rules: start not in the future, end after start, completed ends by this year", () => {
  assert.match(problems({ startYear: "2027" }).startYear ?? "", /cannot be after 2026/);
  assert.match(problems({ startYear: "1960" }).startYear ?? "", /Check the start year/);
  assert.match(problems({ startYear: "20x1" }).startYear ?? "", /like 2022/);
  assert.match(problems({ yearOfGraduation: "2021" }).yearOfGraduation ?? "", /after the start year/);
  assert.match(problems({ yearOfGraduation: "2027" }).yearOfGraduation ?? "", /completed/);
  assert.match(problems({ status: "Pursuing", yearOfGraduation: "2025" }).yearOfGraduation ?? "", /Still pursuing/);
  assert.match(problems({ status: "Pursuing", yearOfGraduation: "2033" }).yearOfGraduation ?? "", /at most 2032/);
  assert.deepEqual(problems({ status: "Pursuing", yearOfGraduation: "2028" }), {});
  assert.match(problems({ status: "Completed", yearOfGraduation: "" }).yearOfGraduation ?? "", /Enter the year you finished/);
});

test("level, degree, institution and status are required once touched", () => {
  assert.match(problems({ qualificationLevel: "" }).qualificationLevel ?? "", /highest qualification/);
  assert.match(problems({ institution: "  " }).institution ?? "", /college or university/);
  assert.match(problems({ degree: "" }).degree ?? "", /Choose your degree/);
  assert.match(problems({ degree: "Other" }).degree ?? "", /Type the name/);
  assert.match(problems({ status: "" }).status ?? "", /completed or pursuing/);
  assert.equal(firstProblem({}), null);
  assert.equal(firstProblem({ score: "b", degree: "a" }), "a");
});

test("only what the admin touched is judged, so an unrelated legacy quirk never blocks a score fix", () => {
  const legacy = { ...bachelors, startYear: "", institution: "" };
  assert.deepEqual(problems({ score: "9" }, legacy), {});
  assert.ok(problems({ startYear: "" }, legacy).startYear);
});

test("the save: other keys survive, the level is stored as its legacy key, and numbers are stored as text", () => {
  const m = mergeAcademics(prodExtra, { qualificationLevel: "Bachelor's", degree: "btech", scoreType: "cgpa", score: " 8.4 " });
  assert.equal(m.academics.level, "bachelors");
  assert.equal(m.academics.degree, "B.Tech");
  assert.equal(m.academics.score, "8.4");
  assert.equal(m.academics.scoreType, "cgpa");
  assert.equal(m.academics.endYear, "2026");
  assert.deepEqual(m.academics.certifications, prodExtra.academics.certifications);
  assert.deepEqual(m.academics.professionalCourses, prodExtra.academics.professionalCourses);
  assert.deepEqual(m.academics.marksheetUploads, prodExtra.academics.marksheetUploads);
  assert.deepEqual(Object.keys(m.changes).sort(), ["degree", "qualificationLevel", "score", "scoreType"]);
  assert.deepEqual(m.changes.score, { from: "", to: "8.4" });
});

test("a save that changes nothing reports no changes (nothing to write or audit)", () => {
  assert.deepEqual(mergeAcademics(prodExtra, { institution: "cbgh", status: "Completed" }).changes, {});
  assert.deepEqual(mergeAcademics(prodExtra, { score: "" }).changes, {});
});

test("switching to Ph.D keeps the score; Completed or Ph.D drops a stale current semester and proofs", () => {
  const pursuing = {
    academics: { ...prodExtra.academics, level: "bachelors", degree: "B.Tech", status: "Pursuing", score: "7.2", scoreType: "cgpa", currentSemester: 5, semesterProofUploads: { "college-id": { name: "x.png", type: "image/png", size: 1 } } },
  };
  const phd = mergeAcademics(pursuing, { qualificationLevel: "Ph.D" });
  assert.equal(phd.academics.score, "7.2");
  assert.equal(phd.academics.scoreType, "cgpa");
  assert.equal("currentSemester" in phd.academics, false);
  const done = mergeAcademics(pursuing, { status: "Completed" });
  assert.equal("currentSemester" in done.academics, false);
  assert.equal("semesterProofUploads" in done.academics, false);
  assert.equal(done.academics.score, "7.2");
  const same = mergeAcademics(pursuing, { score: "7.5" });
  assert.equal(same.academics.currentSemester, 5);
});
