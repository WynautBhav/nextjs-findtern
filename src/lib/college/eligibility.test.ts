import assert from "node:assert/strict";
import test from "node:test";

import { handPicksThatFit, isStudentEligible, readEligibility } from "./eligibility.ts";

const s = (over: Record<string, unknown> = {}) => ({
  userId: "u1", collegeId: "c1", status: "verified" as const, leftAt: null, year: 2, branch: "CSE", degree: "B.Tech", cgpa: 8, score: 7, ...over,
});
const rules = (eligibility: Record<string, unknown>, includeUserIds: string[] = [], excludeUserIds: string[] = []) => ({ collegeId: "c1", eligibility, includeUserIds, excludeUserIds });

test("Degree (26 Nov): a drive limited to degrees takes only those, ignoring case and dots", () => {
  assert.equal(isStudentEligible(s(), rules({ degrees: ["b.tech"] })), true);
  assert.equal(isStudentEligible(s({ degree: "BTech" }), rules({ degrees: ["B.Tech"] })), true);
  assert.equal(isStudentEligible(s({ degree: "BCA" }), rules({ degrees: ["B.Tech"] })), false);
  assert.equal(isStudentEligible(s({ degree: null }), rules({ degrees: ["B.Tech"] })), false, "no degree on file is left out");
  assert.deepEqual(readEligibility({ degrees: ["B.Sc", " ", 3] }).degrees, ["bsc"]);
});

test("Degree (26 Nov): drives saved with the old branch rule still filter on branch", () => {
  assert.equal(isStudentEligible(s(), rules({ branches: ["cse"] })), true);
  assert.equal(isStudentEligible(s({ branch: "ECE" }), rules({ branches: ["cse"] })), false);
});

test("Filters win (26 Nov): a raised cutoff drops the hand-picked students it no longer fits", () => {
  const students = [s({ userId: "a", cgpa: 9.4 }), s({ userId: "b", cgpa: 6.1 }), s({ userId: "c", cgpa: 7, score: 9.5 })];
  // a and b were added by hand; the officer then sets CGPA 9.
  assert.deepEqual(handPicksThatFit(students, rules({ minCgpa: 9 }, ["a", "b"])), ["a"]);
  // No cutoff at all: every hand-pick stays (they may have been picked for another reason, e.g. a missing CGPA).
  assert.deepEqual(handPicksThatFit([s({ userId: "a", cgpa: null })], rules({}, ["a"])), ["a"]);
  assert.deepEqual(handPicksThatFit(students, rules({ minScore: 9 }, ["a", "c"])), ["c"]);
});
