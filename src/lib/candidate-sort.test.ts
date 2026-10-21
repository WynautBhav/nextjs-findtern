import assert from "node:assert/strict";
import { test } from "node:test";

import { compareBySortFields, parseSortFields } from "./candidate-sort.ts";

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
