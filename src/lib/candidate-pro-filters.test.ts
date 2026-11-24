import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PERCENT_PER_CGPA,
  MAX_COLLEGES,
  applyProFilters,
  cgpaLabel,
  cgpaOf,
  collegeKey,
  hasProCriteria,
  parseColleges,
  proChips,
  proFactsOf,
  type ProFacts,
} from "./candidate-pro-filters.ts";
import { collegeSortToken, parseCollegeSort, sortByCollege } from "./candidate-sort.ts";

/* ── cgpaLabel: what an employer reads ──────────────────────────────────── */

test("cgpaLabel shows a CGPA as entered and a percentage as CGPA with the percentage after it", () => {
  assert.equal(cgpaLabel("8.4", "cgpa"), "8.4");
  assert.equal(cgpaLabel("8.47", "cgpa"), "8.47");
  assert.equal(cgpaLabel("85", "percentage"), "8.95 (85%)");
  assert.equal(cgpaLabel("85%", "percentage"), "8.95 (85%)");
  assert.equal(cgpaLabel("99", "percentage"), "10.0 (99%)");
  assert.equal(cgpaLabel("76", ""), "8.0 (76%)");
  assert.equal(cgpaLabel("", "cgpa"), "");
  assert.equal(cgpaLabel("101", "percentage"), "101", "an unreadable score is shown as stored, never dropped");
  assert.equal(cgpaLabel("8.4/10", "cgpa"), "8.4");
  assert.equal(cgpaLabel("8.4/10", "percentage"), "8.4/10", "a /10 score typed as a percentage is shown as stored");
});

/* ── cgpaOf: what a stored score means on the 0-10 scale ──────────────────── */

test("a CGPA row compares directly and is not approximate", () => {
  assert.deepEqual(cgpaOf("8.2", "cgpa"), { value: 8.2, approx: false });
  assert.deepEqual(cgpaOf("10", "cgpa"), { value: 10, approx: false });
  assert.deepEqual(cgpaOf("0", "cgpa"), { value: 0, approx: false });
});

test("a percentage row converts at percent / 9.5 and is approximate", () => {
  assert.equal(PERCENT_PER_CGPA, 9.5);
  assert.deepEqual(cgpaOf("76", "percentage"), { value: 8, approx: true });
  assert.deepEqual(cgpaOf("95", "percentage"), { value: 10, approx: true });
  const v = cgpaOf("85", "percentage");
  assert.ok(v && v.approx && Math.abs(v.value - 8.95) < 0.01);
});

test("a percentage never converts above 10", () => {
  assert.deepEqual(cgpaOf("100", "percentage"), { value: 10, approx: true });
});

test("a trailing % or /10 is tolerated, a comma decimal is not guessed", () => {
  assert.deepEqual(cgpaOf("85%", "percentage"), cgpaOf("85", "percentage"));
  assert.deepEqual(cgpaOf("8.4/10", "cgpa"), { value: 8.4, approx: false });
  assert.equal(cgpaOf("8,4", "cgpa"), null);
});

test("no usable score is null: blank, words, negatives, out of range", () => {
  for (const [score, type] of [["", "cgpa"], ["  ", "percentage"], ["A+", "cgpa"], ["-3", "cgpa"], ["11", "cgpa"], ["101", "percentage"], ["NaN", "cgpa"], ["Infinity", "cgpa"], ["1e2", "percentage"]] as const) {
    assert.equal(cgpaOf(score, type), null, `${score}/${type}`);
  }
});

test("with no score type, 10 or less reads as a CGPA and above as a percentage", () => {
  assert.deepEqual(cgpaOf("7.5", ""), { value: 7.5, approx: false });
  assert.deepEqual(cgpaOf("76", ""), { value: 8, approx: true });
});

/* ── proFactsOf: facts read from a candidate ──────────────────────────────── */

const acad = (over: Partial<{ score: string; scoreType: string; institution: string }> = {}) => ({ score: "8.1", scoreType: "cgpa", institution: "Anna University", ...over });

test("facts: college is trimmed with inner whitespace collapsed, a masked name is no college", () => {
  assert.equal(proFactsOf(acad({ institution: "  IIT   Bombay " }), {}).college, "IIT Bombay");
  assert.equal(proFactsOf(acad({ institution: "[hidden until hire]" }), {}).college, null);
  assert.equal(proFactsOf(acad({ institution: "" }), {}).college, null);
  assert.equal(proFactsOf(null, {}).college, null);
});

test("facts: verified only when the stored status is verified", () => {
  const withStatus = (status: string) => ({ cgpaVerification: { status, claimedScore: "8.1", scoreType: "cgpa", semester: 3 } });
  assert.equal(proFactsOf(acad(), withStatus("verified")).verified, true);
  for (const s of ["pending", "incorrect", "not_required", "garbage"]) assert.equal(proFactsOf(acad(), withStatus(s)).verified, false, s);
  assert.equal(proFactsOf(acad(), {}).verified, false);
  assert.equal(proFactsOf(acad(), null).verified, false);
});

test("facts: the score comes from the profile academics", () => {
  assert.deepEqual(
    (({ cgpa, approx }) => ({ cgpa, approx }))(proFactsOf(acad({ score: "76", scoreType: "percentage" }), {})),
    { cgpa: 8, approx: true },
  );
  assert.equal(proFactsOf(null, {}).cgpa, null);
});

/* ── applyProFilters ───────────────────────────────────────────────────────── */

const f = (cgpa: number | null, college: string | null, over: Partial<ProFacts> = {}): ProFacts => ({ cgpa, approx: false, verified: false, college, ...over });
type Row = { id: string; facts: ProFacts };
const rows: Row[] = [
  { id: "a", facts: f(9.1, "Anna University", { verified: true }) },
  { id: "b", facts: f(8.0, "Anna University", { approx: true }) },
  { id: "c", facts: f(7.2, "IIT Bombay", { verified: true }) },
  { id: "d", facts: f(null, "IIT Bombay") },
  { id: "e", facts: f(6.0, null) },
  { id: "f", facts: f(null, null) },
];
const run = (c: Partial<{ cgpaMin: number; cgpaVerified: boolean; colleges: string[] }>) =>
  applyProFilters(rows, (r) => r.facts, { cgpaMin: 0, cgpaVerified: false, colleges: [], ...c });
const ids = (r: { kept: Row[] }) => r.kept.map((x) => x.id);

test("no criteria keeps everyone and counts nothing", () => {
  const r = run({});
  assert.deepEqual(ids(r), ["a", "b", "c", "d", "e", "f"]);
  assert.equal(r.hiddenNoScore, 0);
  assert.equal(r.approxKept, 0);
  assert.equal(hasProCriteria({ cgpaMin: 0, cgpaVerified: false, colleges: [] }), false);
});

test("a minimum CGPA keeps scores at or above it, converted rows included", () => {
  assert.deepEqual(ids(run({ cgpaMin: 8 })), ["a", "b"]);
  assert.deepEqual(ids(run({ cgpaMin: 8.1 })), ["a"]);
  assert.deepEqual(ids(run({ cgpaMin: 0.1 })), ["a", "b", "c", "e"]);
});

test("a candidate with no score never matches an active CGPA filter, and the hidden count says how many", () => {
  const r = run({ cgpaMin: 0.1 });
  assert.ok(!ids(r).includes("d") && !ids(r).includes("f"));
  assert.equal(r.hiddenNoScore, 2);
});

test("the approximate count is how many kept results rest on a converted percentage", () => {
  assert.equal(run({ cgpaMin: 7 }).approxKept, 1);
  assert.equal(run({ cgpaMin: 9 }).approxKept, 0);
});

test("verified only keeps verified CGPAs, with or without a minimum", () => {
  assert.deepEqual(ids(run({ cgpaVerified: true })), ["a", "c"]);
  assert.deepEqual(ids(run({ cgpaVerified: true, cgpaMin: 8 })), ["a"]);
});

test("a verified flag with no usable score still never matches", () => {
  const odd: Row[] = [{ id: "x", facts: f(null, "X", { verified: true }) }];
  const r = applyProFilters(odd, (o) => o.facts, { cgpaMin: 0, cgpaVerified: true, colleges: [] });
  assert.deepEqual(r.kept, []);
  assert.equal(r.hiddenNoScore, 1);
});

test("colleges match case- and space-insensitively and any one of them is enough", () => {
  assert.deepEqual(ids(run({ colleges: ["anna  university"] })), ["a", "b"]);
  assert.deepEqual(ids(run({ colleges: ["Anna University", "IIT Bombay"] })), ["a", "b", "c", "d"]);
  assert.deepEqual(ids(run({ colleges: ["Nowhere College"] })), []);
});

test("a candidate with no college never matches a college filter", () => {
  assert.ok(!ids(run({ colleges: ["Anna University"] })).includes("e"));
});

test("college and CGPA filters combine (AND)", () => {
  assert.deepEqual(ids(run({ colleges: ["IIT Bombay"], cgpaMin: 7 })), ["c"]);
});

test("the college filter does not count missing scores unless a CGPA filter is on", () => {
  assert.equal(run({ colleges: ["IIT Bombay"] }).hiddenNoScore, 0);
});

test("college options come from the pool after the CGPA filter but before the college filter, with counts", () => {
  const all = run({ colleges: ["Anna University"] }).options;
  assert.deepEqual(all, [
    { name: "Anna University", count: 2 },
    { name: "IIT Bombay", count: 2 },
  ]);
  const scored = run({ cgpaMin: 8 }).options;
  assert.deepEqual(scored, [{ name: "Anna University", count: 2 }]);
});

test("college options: biggest first, then A-Z, one entry per spelling-insensitive name, bounded", () => {
  const many: Row[] = [
    ...Array.from({ length: 250 }, (_, i) => ({ id: `n${i}`, facts: f(8, `College ${String(i).padStart(3, "0")}`) })),
    { id: "x1", facts: f(8, "Zeta Institute") },
    { id: "x2", facts: f(8, "zeta  institute") },
  ];
  const r = applyProFilters(many, (m) => m.facts, { cgpaMin: 0, cgpaVerified: false, colleges: [] });
  assert.equal(r.options.length, 200);
  assert.deepEqual(r.options[0], { name: "Zeta Institute", count: 2 });
  assert.equal(r.options[1].name, "College 000");
});

/* ── parseColleges / collegeKey ────────────────────────────────────────────── */

test("collegeKey folds case, inner whitespace and unicode width", () => {
  assert.equal(collegeKey("  St.  Xavier’s College "), collegeKey("st. xavier’s college"));
  assert.equal(collegeKey("Ｔｅｓｔ"), collegeKey("test"));
});

test("parseColleges keeps repeated values whole (commas stay inside a name), trims, dedupes, caps", () => {
  assert.deepEqual(parseColleges(undefined), []);
  assert.deepEqual(parseColleges("Indian Institute of Technology, Bombay"), ["Indian Institute of Technology, Bombay"]);
  assert.deepEqual(parseColleges(["A & B College", " A & B College ", "", "  ", "a & b college", "Ünï University"]), ["A & B College", "Ünï University"]);
  const long = Array.from({ length: 25 }, (_, i) => `College ${i}`);
  assert.equal(parseColleges(long).length, MAX_COLLEGES);
  assert.equal(parseColleges("x".repeat(500))[0].length, 200);
});

/* ── college sort ─────────────────────────────────────────────────────────── */

test("parseCollegeSort reads sort=college (A-Z) and sort=college_desc (Z-A), anywhere in the list", () => {
  assert.equal(parseCollegeSort(undefined), null);
  assert.equal(parseCollegeSort("coding"), null);
  assert.equal(parseCollegeSort("college"), "asc");
  assert.equal(parseCollegeSort("coding,college_desc"), "desc");
  assert.equal(parseCollegeSort(["coding", "college"]), "asc");
  assert.equal(parseCollegeSort("college,college_desc"), "asc");
  assert.equal(collegeSortToken("asc"), "college");
  assert.equal(collegeSortToken("desc"), "college_desc");
  assert.equal(collegeSortToken(null), "");
});

test("sortByCollege orders A-Z or Z-A, no college last either way, ties keep their order", () => {
  const list = [
    { id: "1", college: "Zeta" },
    { id: "2", college: null },
    { id: "3", college: "alpha" },
    { id: "4", college: "Zeta" },
    { id: "5", college: "Beta" },
  ];
  const key = (x: { college: string | null }) => x.college;
  assert.deepEqual(sortByCollege(list, key, "asc").map((x) => x.id), ["3", "5", "1", "4", "2"]);
  assert.deepEqual(sortByCollege(list, key, "desc").map((x) => x.id), ["1", "4", "5", "3", "2"]);
  assert.deepEqual(list.map((x) => x.id), ["1", "2", "3", "4", "5"], "input is not mutated");
});

/* ── chips ────────────────────────────────────────────────────────────────── */

test("proChips: nothing active, no chips", () => {
  assert.deepEqual(proChips({ cgpaMin: 0, cgpaVerified: false, colleges: [] }), []);
});

test("proChips: a chip per active filter, each removal leaves the others untouched", () => {
  const c = { cgpaMin: 7.5, cgpaVerified: true, colleges: ["IIT Bombay", "A & B College"] };
  const chips = proChips(c);
  assert.deepEqual(chips.map((x) => x.label), ["CGPA 7.5+", "Verified CGPA only", "College: IIT Bombay", "College: A & B College"]);
  assert.deepEqual(chips[0].without, { cgpaMin: 0, cgpaVerified: true, colleges: c.colleges });
  assert.deepEqual(chips[1].without, { cgpaMin: 7.5, cgpaVerified: false, colleges: c.colleges });
  assert.deepEqual(chips[2].without, { cgpaMin: 7.5, cgpaVerified: true, colleges: ["A & B College"] });
  assert.deepEqual(chips[3].without.colleges, ["IIT Bombay"]);
  assert.equal(new Set(chips.map((x) => x.key)).size, chips.length, "keys are unique");
  assert.deepEqual(c.colleges, ["IIT Bombay", "A & B College"], "input is not mutated");
});

test("proChips: the CGPA floor prints one decimal", () => {
  assert.equal(proChips({ cgpaMin: 8, cgpaVerified: false, colleges: [] })[0].label, "CGPA 8.0+");
});
