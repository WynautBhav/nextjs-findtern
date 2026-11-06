import assert from "node:assert/strict";
import { test } from "node:test";

import { rowSkills, skillBaseName, sortChangeAction, sortCommitValue } from "./candidate-view.ts";

test("skillBaseName drops the level", () => {
  assert.equal(skillBaseName("React · Advanced"), "React");
  assert.equal(skillBaseName("SQL"), "SQL");
});

test("rowSkills caps at 7, counts the rest, and puts project skills first", () => {
  const skills = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const { shown, more } = rowSkills(skills, new Set(["i"]));
  assert.equal(shown.length, 7);
  assert.equal(shown[0], "I");
  assert.equal(more, 2);
});

test("rowSkills matches a leveled skill on its name", () => {
  const { shown, isWanted } = rowSkills(["Go", "React · Advanced"], new Set(["react"]));
  assert.equal(shown[0], "React · Advanced");
  assert.equal(isWanted("React · Advanced"), true);
});

test("rowSkills shows seven or fewer without a +N", () => {
  assert.equal(rowSkills(["A", "B"], new Set()).more, 0);
  assert.equal(rowSkills(["A", "B", "C", "D", "E", "F", "G"], new Set()).more, 0);
});

test("a keyboard step on the sort select holds; a pointer choice navigates", () => {
  assert.equal(sortChangeAction(true), "hold");
  assert.equal(sortChangeAction(false), "navigate");
});

test("committing a held sort choice applies only a real change", () => {
  assert.equal(sortCommitValue("score", "fit"), "score");
  assert.equal(sortCommitValue("fit", "fit"), null);
  assert.equal(sortCommitValue(null, "fit"), null);
});
