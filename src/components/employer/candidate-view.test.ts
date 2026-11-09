import assert from "node:assert/strict";
import { test } from "node:test";

import { AVATAR_TINTS, avatarTint, headlineOf, rowSkills, skillLead, studyOf, skillBaseName, sortChangeAction, sortCommitValue } from "./candidate-view.ts";

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

test("headlineOf: degree and field, else the top two skills, else nothing - never the bio", () => {
  const academics = { degree: "B.Tech", specialization: "Computer Science" };
  assert.equal(headlineOf({ academics, skills: ["React"] }), "B.Tech, Computer Science");
  assert.equal(headlineOf({ academics: null, skills: ["React · Advanced", "Python", "SQL"] }), "React and Python intern");
  assert.equal(headlineOf({ academics: { degree: "", specialization: "" }, skills: [] }), "");
  // A bio on the object is ignored even if present.
  assert.equal(headlineOf({ academics: null, skills: [], bio: "Call me on 98…" } as never), "");
});

test("studyOf / headlineOf drop a field the contact scrub masked whole (B.Tech read as a .tech domain)", () => {
  const academics = { degree: "[hidden until hire]", specialization: "Computer Engineering" };
  assert.equal(studyOf(academics), "Computer Engineering");
  assert.equal(headlineOf({ academics, skills: ["React"] }), "Computer Engineering");
  // Both masked: fall back to the skills line, never the marker.
  assert.equal(headlineOf({ academics: { degree: "[hidden until hire]", specialization: "[hidden until hire]" }, skills: ["SQL"] }), "SQL intern");
});

test("avatarTint: deterministic, one of the four, and ids can differ", () => {
  assert.equal(avatarTint("a"), avatarTint("a"));
  assert.ok(AVATAR_TINTS.includes(avatarTint("some-intern-id") as (typeof AVATAR_TINTS)[number]));
  // "a" = 97 -> 1, "b" = 98 -> 2
  assert.equal(avatarTint("a"), AVATAR_TINTS[1]);
  assert.notEqual(avatarTint("a"), avatarTint("b"));
  assert.equal(avatarTint(""), AVATAR_TINTS[0]);
});

test("skillLead: top three skills (asked-for first) lead the row, the chips get the rest", () => {
  const skills = ["React · Advanced", "Python", "SQL", "Redis", "Go"];
  assert.deepEqual(skillLead(skills, new Set()), { lead: "React, Python and SQL", rest: ["Redis", "Go"] });
  assert.deepEqual(skillLead(skills, new Set(["go", "redis"])), { lead: "Redis, Go and React", rest: ["Python", "SQL"] });
  assert.deepEqual(skillLead(["Rust", "C"], new Set()), { lead: "Rust and C", rest: [] });
  assert.deepEqual(skillLead(["Rust"], new Set()), { lead: "Rust", rest: [] });
  assert.deepEqual(skillLead([], new Set()), { lead: "", rest: [] });
});

test("rowSkills: skip keeps the lead and the chips within seven together", () => {
  const ten = Array.from({ length: 10 }, (_, i) => `S${i + 1}`);
  const { shown, more } = rowSkills(ten, new Set(), 7, 3);
  assert.deepEqual(shown, ["S4", "S5", "S6", "S7"]);
  assert.equal(more, 3);
});
