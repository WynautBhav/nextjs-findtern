import assert from "node:assert/strict";
import { test } from "node:test";

import { projectSkillSave } from "./project-skill-sync.ts";
import { EDITABLE_WHILE_PUBLISHED, isLockedWhilePublished } from "./projects/lifecycle.ts";

const four = ["React", "SQL", "Figma", "Python"];

// Bug sheet 25 Nov: chips only filter; the project changes only through "Save to project", at 4 to 7 skills.
test("chips that match the project's skills (any order or case) offer no save", () => {
  assert.deepEqual(projectSkillSave(four, ["python", "React", "figma", "SQL"]), { state: "same" });
});

test("a changed list of 4 to 7 skills can be saved", () => {
  assert.deepEqual(projectSkillSave(four, four.slice(0, 3).concat("Go")), { state: "ready" });
  assert.deepEqual(projectSkillSave(four, [...four, "Go", "Rust", "C"]), { state: "ready" });
  assert.deepEqual(projectSkillSave([], four), { state: "ready" });
});

test("under 4 or over 7 the save waits, and says what is needed", () => {
  assert.deepEqual(projectSkillSave(four, []), { state: "blocked", message: "Pick 4 to 7 skills to save them to the project." });
  assert.deepEqual(projectSkillSave(four, ["React"]), { state: "blocked", message: "Add 3 more skills to save them to the project." });
  assert.deepEqual(projectSkillSave(four, ["React", "SQL", "Go"]), { state: "blocked", message: "Add 1 more skill to save them to the project." });
  assert.equal(projectSkillSave(four, [...four, "Go", "Rust", "C", "Java"]).state, "blocked");
});

test("a live project's skills can be edited", () => {
  assert.ok((EDITABLE_WHILE_PUBLISHED as readonly string[]).includes("skills"));
  assert.equal(isLockedWhilePublished("skills"), false);
});

test("a picked city saves with its state on an on-site or hybrid project", async () => {
  const { projectCityPlan } = await import("./project-skill-sync.ts");
  const districts = [
    { district: "Pune", state: "Maharashtra" },
    { district: "Aurangabad", state: "Bihar" },
    { district: "Aurangabad", state: "Maharashtra" },
  ];
  const onsite = { locationType: "onsite", state: "Maharashtra" };
  assert.deepEqual(projectCityPlan("pune", onsite, districts), { action: "save", body: { city: "Pune", state: "Maharashtra" }, label: "Pune, Maharashtra" });
  assert.deepEqual(projectCityPlan("Aurangabad", onsite, districts), { action: "save", body: { city: "Aurangabad", state: "Maharashtra" }, label: "Aurangabad, Maharashtra" });
  assert.equal(projectCityPlan("Aurangabad", { locationType: "hybrid", state: "Goa" }, districts).action, "skip");
  assert.equal(projectCityPlan("Atlantis", onsite, districts).action, "skip");
  assert.equal(projectCityPlan("", onsite, districts).action, "skip");
  // Remote: no work location, so a picked or cleared city never writes to the project.
  assert.equal(projectCityPlan("pune", { locationType: "remote", state: null }, districts).action, "skip");
  assert.equal(projectCityPlan("", { locationType: "remote", state: null }, districts).action, "skip");
  assert.equal(projectCityPlan("Atlantis", { locationType: "remote", state: null }, districts).action, "skip");
});

test("a live project's city and state can be edited, its work mode cannot", () => {
  assert.equal(isLockedWhilePublished("city"), false);
  assert.equal(isLockedWhilePublished("state"), false);
  assert.equal(isLockedWhilePublished("locationType"), true);
});
