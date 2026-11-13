import assert from "node:assert/strict";
import { test } from "node:test";

import { skillAlignment } from "./skill-rows.ts";

const a = { skills: ["React · Advanced", "SQL", "Figma"] };
const b = { skills: ["sql", "Node.js · Beginner"] };
const c = { skills: [] as string[] };

test("one row per required skill, one flag per candidate, in candidate order", () => {
  const { rows } = skillAlignment(["React", "SQL", "Go"], [a, b, c]);
  assert.deepEqual(rows, [
    { skill: "React", has: [true, false, false] },
    { skill: "SQL", has: [true, true, false] },
    { skill: "Go", has: [false, false, false] },
  ]);
});

test("matching ignores case and the level, and the required skill keeps its spelling", () => {
  const { rows } = skillAlignment(["REACT · Beginner", "Sql"], [a, b]);
  assert.deepEqual(rows.map((r) => r.skill), ["REACT", "Sql"]);
  assert.deepEqual(rows[0].has, [true, false]);
  assert.deepEqual(rows[1].has, [true, true]);
});

test("a repeated or empty required skill makes no extra row", () => {
  const { rows } = skillAlignment(["React", "react · Advanced", "", "  "], [a]);
  assert.equal(rows.length, 1);
});

test("other skills are what is not required, without levels or repeats", () => {
  const { other } = skillAlignment(["React", "SQL"], [a, b, c, { skills: ["Figma", "figma · Advanced", "Figma"] }]);
  assert.deepEqual(other[0], { skills: ["Figma"], more: 0 });
  assert.deepEqual(other[1], { skills: ["Node.js"], more: 0 });
  assert.deepEqual(other[2], { skills: [], more: 0 });
  assert.deepEqual(other[3], { skills: ["Figma"], more: 0 });
});

test("other skills are capped, and the cut ones are counted", () => {
  const many = { skills: ["A", "B", "C", "D", "E", "F", "G", "H", "I"] };
  const { other } = skillAlignment(["A"], [many]);
  assert.equal(other[0].skills.length, 7);
  assert.equal(other[0].more, 1);
  assert.deepEqual(skillAlignment([], [many], 3).other[0], { skills: ["A", "B", "C"], more: 6 });
});

test("no required skills: no rows, every skill is an other skill", () => {
  const { rows, other } = skillAlignment([], [a]);
  assert.deepEqual(rows, []);
  assert.deepEqual(other[0].skills, ["React", "SQL", "Figma"]);
});
