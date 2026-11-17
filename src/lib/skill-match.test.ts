import test from "node:test";
import assert from "node:assert/strict";
import { studentsForSkill, type PublicStudent } from "./skill-match.ts";

const s = (category: string | undefined, skills: string[], degree = ""): PublicStudent => ({
  id: "", initials: "AB", shortName: "Candidate AB", score: 7, band: "Cappuccino",
  college: "", degree, city: "", state: "", category, skills, ratings: {}, available: true,
});

const pool = [
  s("Design", ["Figma", "Wireframing"]),
  s(undefined, ["Salesforce", "Cold Calling"]),
  s("Technology", ["React", "TypeScript"]),
  s(undefined, ["HR"], "PGDHRM"),
];

test("counts follow the same keyword match as the bench dialog", () => {
  assert.equal(studentsForSkill(pool, "Sales").length, 1);
  assert.equal(studentsForSkill(pool, "Technology").length, 1);
  assert.equal(studentsForSkill(pool, "Human Resource").length, 1);
  assert.equal(studentsForSkill(pool, "Nonexistent").length, 0);
});

test("empty or 'all' returns the whole pool", () => {
  assert.equal(studentsForSkill(pool, "").length, 4);
  assert.equal(studentsForSkill(pool, "all").length, 4);
});

test("a featured skill with regex characters in its name matches by its literal text and never throws", () => {
  const withCpp = [s(undefined, ["C++", "STL"]), s(undefined, ["C", "Java"]), s(undefined, ["C#"]), s(undefined, ["F#"])];
  assert.equal(studentsForSkill(withCpp, "C++").length, 1, "C++ is a literal, not a quantifier");
  assert.equal(studentsForSkill(withCpp, "C#").length, 1);
  for (const odd of ["(", "[a", "R+", "a|b", "\\", "?", "*"]) {
    assert.doesNotThrow(() => studentsForSkill(withCpp, odd), `skill name ${JSON.stringify(odd)}`);
  }
});

test("a short skill name is not mistaken for a category it happens to sit inside", () => {
  const p = [s(undefined, ["R", "Statistics"]), s(undefined, ["Recruitment", "Payroll"]), s("Human Resource", ["HRMS"])];
  // "r" is a substring of "human resource"; "C" and "R" used to return every HR candidate.
  assert.equal(studentsForSkill(p, "R").length, 1);
  assert.equal(studentsForSkill(p, "C").length, 0);
  assert.equal(studentsForSkill(p, "Ru").length, 0);
});

test("a shortened category name still finds its category", () => {
  assert.equal(studentsForSkill(pool, "Tech").length, 1);
  assert.equal(studentsForSkill(pool, "Social Media").length, 0);
  assert.equal(studentsForSkill([s(undefined, ["Reels"])], "Social Media").length, 1);
});
