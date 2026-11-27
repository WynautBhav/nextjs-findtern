import assert from "node:assert/strict";
import test from "node:test";

import { degreeOptions, degreeYears, fullTimeReady } from "./eligibility.ts";

// Owner, 27 Nov: a full-time offer goes to the last two semesters of the degree: B.Tech sem 7-8, BBA sem 5-6.

/** [degree text, years the degree runs]: every spelling must land on the same duration. */
const DURATIONS: [string, number][] = [
  ["B.Tech", 4], ["B. Tech", 4], ["btech", 4], ["BTech", 4], ["b.tech", 4], ["Bachelor of Technology", 4], ["B.Tech CSE", 4],
  ["BE", 4], ["B.E.", 4], ["Bachelor of Engineering", 4],
  ["B.Arch", 5], ["B Arch", 5], ["Bachelor of Architecture", 5],
  ["BS-MS", 5], ["B.S.-M.S.", 5],
  ["B.Des", 4], ["Bachelor of Design", 4],
  ["B.Pharm", 4], ["B Pharm", 4], ["Bachelor of Pharmacy", 4],
  ["BBA", 3], ["B.B.A", 3], ["Bachelor of Business Administration", 3],
  ["BCA", 3], ["Bachelor of Computer Applications", 3],
  ["B.Com", 3], ["BCom", 3], ["B.Com (Hons)", 3],
  ["B.Sc", 3], ["BSc", 3], ["B.Sc Physics", 3],
  ["BA", 3], ["B.A.", 3],
  ["BBM", 3], ["BMS", 3],
  ["MBA", 2], ["M.B.A", 2], ["MCA", 2], ["M.Tech", 2], ["MTech", 2], ["M.Sc", 2], ["MSc", 2], ["MA", 2], ["M.A.", 2], ["M.Com", 2], ["MCom", 2],
  ["BBA-MBA", 5], ["BBA + MBA", 5], ["B.Tech-M.Tech", 5], ["B.Tech + M.Tech Integrated", 5], ["Integrated MBA", 5], ["B.Sc-M.Sc", 5],
  ["LLB", 3], ["LL.B", 3], ["BA LLB", 5], ["BBA LLB", 5], ["B.Com LLB", 5], ["BA, LLB", 5],
  ["M.Arch", 2], ["Master of Architecture", 2], ["Master of Engineering", 2], ["M.Pharm", 2], ["M.Des", 2], ["LLM", 2], ["LL.M", 2],
  ["B.Sc Nursing", 4], ["B.Sc (Hons) Agriculture", 4], ["BSc Agriculture", 4],
];

test("degree duration: every spelling of every degree maps to its length", () => {
  for (const [text, years] of DURATIONS) assert.equal(degreeYears(text), years, text);
});

test("degree duration: a branch name is not a degree (ME is Mechanical, not M.E.)", () => {
  for (const b of ["CSE", "ME", "ECE", "AI & DS", "Design", "Marketing", null, ""]) assert.equal(degreeYears(b), null, String(b));
});

/** [degree, last-but-one semester, last semester]: the two final-year semesters. */
test("final year by semester: the last two semesters are ready, the one before is not", () => {
  for (const [text, years] of DURATIONS) {
    const last = years * 2;
    // No year on file: the semester alone decides.
    assert.equal(fullTimeReady({ year: null, semester: last, degree: text, branch: "CSE" }), true, `${text} sem ${last}`);
    assert.equal(fullTimeReady({ year: null, semester: last - 1, degree: text, branch: "CSE" }), true, `${text} sem ${last - 1}`);
    assert.equal(fullTimeReady({ year: null, semester: last - 2, degree: text, branch: "CSE" }), false, `${text} sem ${last - 2} alone`);
    assert.equal(fullTimeReady({ year: 4, semester: last - 2, degree: text, branch: "CSE" }), false, `${text} sem ${last - 2}`);
    assert.equal(fullTimeReady({ year: 2, semester: 2, degree: text, branch: "CSE" }), false, `${text} sem 2`);
  }
});

test("final year by year alone (no semester): the last year of the degree", () => {
  for (const [text, years] of DURATIONS) {
    assert.equal(fullTimeReady({ year: years, semester: null, degree: text, branch: "CSE" }), true, `${text} year ${years}`);
    assert.equal(fullTimeReady({ year: years - 1, semester: null, degree: text, branch: "CSE" }), false, `${text} year ${years - 1}`);
    assert.equal(fullTimeReady({ year: null, semester: null, degree: text, branch: "CSE" }), false, `${text} no year`);
  }
});

test("the owner's examples", () => {
  const f = (degree: string, semester: number | null, year: number | null = null) => fullTimeReady({ degree, semester, year, branch: "CSE" });
  assert.equal(f("B.Tech", 7), true);
  assert.equal(f("B.Tech", 8), true);
  assert.equal(f("B.Tech", 6, 3), false, "B.Tech 3rd year semester 6 is not final year");
  assert.equal(f("B.Tech", 5), false);
  assert.equal(f("BBA", 5), true);
  assert.equal(f("BBA", 6), true);
  assert.equal(f("BBA", 4), false);
  assert.equal(f("BBA", 5, 2), false, "year and semester disagree: the stricter wins, a self-entered semester never opens full-time");
  assert.equal(f("B.Tech", 5, 4), false, "year 4 but semester 5: not final year");
  assert.equal(f("B.Tech", 2, 2), false);
  assert.equal(f("B.Tech", 8, 4), true);
  assert.equal(f("B.Arch", 8), false);
  assert.equal(f("B.Arch", 9), true);
});

test("the degree comes from the degree field first, the branch second (seed: branch CSE, degree B.Tech)", () => {
  assert.equal(fullTimeReady({ year: 3, semester: 6, degree: "B.Tech", branch: "CSE" }), false);
  assert.equal(fullTimeReady({ year: 3, semester: 5, degree: "BBA", branch: "Marketing" }), true);
  assert.equal(fullTimeReady({ year: 3, semester: null, degree: null, branch: "BBA" }), true);
  assert.equal(fullTimeReady({ year: 3, semester: 5, degree: null, branch: "B.Tech CSE" }), false);
});

test("unknown degree keeps the old rule: 4th year, 3rd year from semester 6, or semester 7+ with no year", () => {
  assert.equal(fullTimeReady({ year: 4, semester: null, degree: null, branch: "Design" }), true);
  assert.equal(fullTimeReady({ year: 3, semester: 6, degree: null, branch: "Design" }), true);
  assert.equal(fullTimeReady({ year: 3, semester: 5, degree: null, branch: "Design" }), false);
  assert.equal(fullTimeReady({ year: null, semester: 7, degree: "Diploma", branch: null }), true);
  assert.equal(fullTimeReady({ year: 2, semester: 4, degree: null, branch: null }), false);
  assert.equal(fullTimeReady({ year: 2, semester: 8, degree: null, branch: null }), false, "a year on file is not overridden by a self-entered semester");
});

// ── Item 3: the Degree filter's options ──────────────────────────────────────────────────────────────────────────
test("degree options: each degree once, spellings merged, blanks dropped, A to Z", () => {
  const rows = [
    { degree: "B.Tech" }, { degree: "BTech" }, { degree: "b.tech" }, { degree: " B. Tech " },
    { degree: "BBA" }, { degree: "bba" }, { degree: null }, { degree: "" }, { degree: "  " }, { degree: "..." }, {},
    { degree: "BCA" }, { degree: "M.Sc" }, { degree: "MSc" },
  ];
  assert.deepEqual(degreeOptions(rows), ["B.Tech", "BBA", "BCA", "M.Sc"]);
});

test("degree options: a degree held by one student only still shows; no students means no options", () => {
  assert.deepEqual(degreeOptions([{ degree: "B.Tech" }, { degree: "B.Arch" }]), ["B.Arch", "B.Tech"]);
  assert.deepEqual(degreeOptions([]), []);
  assert.deepEqual(degreeOptions([{ degree: null }]), []);
});
