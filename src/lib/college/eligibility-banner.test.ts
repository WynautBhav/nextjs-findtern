import { test } from "node:test";
import assert from "node:assert/strict";

import { firstEligibleDrive, type StudentFacts } from "./eligibility.ts";

const student = (o: Partial<StudentFacts> = {}): StudentFacts => ({
  userId: "u1", collegeId: "c1", status: "verified", leftAt: null, year: 4, branch: "CSE", cgpa: 8, score: 7, semester: 7, ...o,
});
const drive = (id: string, o: Record<string, unknown> = {}) => ({
  id, collegeId: "c1", kind: "internship", eligibility: {}, includeUserIds: [] as string[], excludeUserIds: [] as string[], ...o,
});

test("the banner skips a live drive the student is not eligible for and shows the next one they are", () => {
  const drives = [drive("intern-2-3", { eligibility: { years: [2, 3] } }), drive("ft", { kind: "full_time", eligibility: { years: [4] } })];
  assert.equal(firstEligibleDrive(drives, student())?.id, "ft");
  assert.equal(firstEligibleDrive(drives, student({ year: 2, semester: 3 }))?.id, "intern-2-3");
});

test("no banner when no live drive takes the student", () => {
  assert.equal(firstEligibleDrive([drive("ft", { kind: "full_time" })], student({ year: 2, semester: 3 })), null);
  assert.equal(firstEligibleDrive([drive("d", { excludeUserIds: ["u1"] })], student()), null);
  assert.equal(firstEligibleDrive([], student()), null);
});
