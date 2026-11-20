import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activeSortDir,
  collegeSortWithDir,
  compareBySortFields,
  defaultSortDir,
  parseSortDir,
  parseSortFields,
  pickSortPatch,
  sortChoiceOf,
  sortDirPatch,
} from "./candidate-sort.ts";

const c = (score: number, coding: number, communication: number) => ({
  score,
  ratings: { coding, communication, aptitude: 0, interview: 0 },
});

test("parseSortFields keeps valid distinct fields, max three", () => {
  assert.deepEqual(parseSortFields(undefined), []);
  assert.deepEqual(parseSortFields("coding,communication"), ["coding", "communication"]);
  assert.deepEqual(parseSortFields(["coding", "", "coding", "bogus", "aptitude", "score", "interview"]), ["coding", "aptitude", "score"]);
});

test("compareBySortFields breaks ties on the next field", () => {
  const list = [c(5, 8, 3), c(9, 8, 7), c(7, 6, 9)];
  const byCodingThenComm = [...list].sort((a, b) => compareBySortFields(a, b, ["coding", "communication"], "desc"));
  assert.deepEqual(byCodingThenComm.map((x) => x.score), [9, 5, 7]);
  const asc = [...list].sort((a, b) => compareBySortFields(a, b, ["coding", "communication"], "asc"));
  assert.deepEqual(asc.map((x) => x.score), [7, 5, 9]);
  const fallback = [...list].sort((a, b) => compareBySortFields(a, b, [], "desc"));
  assert.deepEqual(fallback.map((x) => x.score), [9, 7, 5]);
});

test("parseSortDir: high to low unless asc is asked for, and only while a score field is chosen", () => {
  assert.equal(parseSortDir(undefined, ["score"]), "desc");
  assert.equal(parseSortDir("asc", ["score"]), "asc");
  assert.equal(parseSortDir("desc", ["score"]), "desc");
  assert.equal(parseSortDir(["asc", "desc"], ["coding"]), "asc");
  for (const bad of ["", "ASC", "up", "1", "asc,desc"]) assert.equal(parseSortDir(bad, ["score"]), "desc", bad);
  // Best match (no field) has one order: a stray dir=asc changes nothing.
  assert.equal(parseSortDir("asc", []), "desc");
});

test("every sort starts at today's direction: scores high to low, colleges A-Z", () => {
  for (const choice of ["score", "communication", "coding", "aptitude", "interview"] as const) {
    assert.equal(defaultSortDir(choice), "desc");
    assert.deepEqual(pickSortPatch(choice), { sorts: [choice], dir: "desc", collegeSort: null });
  }
  assert.equal(defaultSortDir("college"), "asc");
  assert.deepEqual(pickSortPatch("college"), { sorts: [], dir: "desc", collegeSort: "asc" });
  assert.deepEqual(pickSortPatch(""), { sorts: [], dir: "desc", collegeSort: null });
});

test("the direction control reads and writes the right field per sort", () => {
  assert.equal(sortChoiceOf(["coding"], null), "coding");
  assert.equal(sortChoiceOf([], "desc"), "college");
  assert.equal(sortChoiceOf([], null), "");
  assert.equal(activeSortDir("", "desc", null), null, "Best match has no direction");
  assert.equal(activeSortDir("score", "asc", null), "asc");
  assert.equal(activeSortDir("college", "desc", "desc"), "desc");
  assert.deepEqual(sortDirPatch("score", "asc"), { dir: "asc" });
  assert.deepEqual(sortDirPatch("college", "desc"), { collegeSort: "desc" });
});

test("sort=college&dir=desc reads as Z-A; college_desc stays Z-A; dir is ignored for other values", () => {
  assert.equal(collegeSortWithDir("asc", "desc"), "desc");
  assert.equal(collegeSortWithDir("asc", "asc"), "asc");
  assert.equal(collegeSortWithDir("asc", undefined), "asc");
  assert.equal(collegeSortWithDir("asc", "sideways"), "asc");
  assert.equal(collegeSortWithDir("desc", "asc"), "desc");
  assert.equal(collegeSortWithDir(null, "desc"), null);
});

test("a candidate with no value sorts last in both directions", () => {
  const list = [
    { id: "none", score: 0, scored: false, ratings: { coding: 0, communication: 0, aptitude: 0, interview: 0 } },
    { id: "low", score: 4, scored: true, ratings: { coding: 3, communication: 0, aptitude: 0, interview: 0 } },
    { id: "high", score: 9, scored: true, ratings: { coding: 8, communication: 0, aptitude: 0, interview: 0 } },
  ];
  const order = (fields: Parameters<typeof compareBySortFields>[2], dir: "asc" | "desc") =>
    [...list].sort((a, b) => compareBySortFields(a, b, fields, dir)).map((x) => x.id);
  assert.deepEqual(order(["score"], "desc"), ["high", "low", "none"]);
  assert.deepEqual(order(["score"], "asc"), ["low", "high", "none"]);
  assert.deepEqual(order(["coding"], "desc"), ["high", "low", "none"]);
  assert.deepEqual(order(["coding"], "asc"), ["low", "high", "none"]);
  // A zero score that was really scored is a real value, not a gap.
  const zero = { id: "zero", score: 0, scored: true, ratings: list[0].ratings };
  assert.ok(compareBySortFields(zero, list[0], ["score"], "asc") < 0);
});
