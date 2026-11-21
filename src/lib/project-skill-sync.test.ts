import assert from "node:assert/strict";
import { test } from "node:test";

import { projectSkillPlan } from "./project-skill-sync.ts";
import { EDITABLE_WHILE_PUBLISHED, isLockedWhilePublished } from "./projects/lifecycle.ts";

const four = ["React", "SQL", "Figma", "Python"];

test("four or more skills save to the project", () => {
  assert.deepEqual(projectSkillPlan(four.slice(0, 3), four.slice(0, 3), four), { action: "save" });
  assert.deepEqual(projectSkillPlan(four, four, [...four, "Go"]), { action: "save" });
  assert.deepEqual(projectSkillPlan([...four, "Go"], [...four, "Go"], four), { action: "save" });
});

test("removing below four is refused once the list has four", () => {
  const plan = projectSkillPlan(four, four, four.slice(1));
  assert.equal(plan.action, "block");
  assert.match(plan.action === "block" ? plan.message : "", /at least 4 skills/);
});

test("a refused chip on a three-skill project can be removed", () => {
  assert.equal(projectSkillPlan(["React", "SQL", "Go"], ["React", "SQL", "Go", "ed"], ["React", "SQL", "Go"]).action, "filter");
});

test("under four the change only filters, and says how many more are needed", () => {
  assert.deepEqual(projectSkillPlan([], [], ["React"]), { action: "filter", message: "Add 3 more skills to save them to the project." });
  assert.deepEqual(projectSkillPlan(["React"], ["React", "SQL"], ["React", "SQL", "Go"]), { action: "filter", message: "Add 1 more skill to save them to the project." });
  // Already under four (a legacy project): removing is not blocked.
  assert.equal(projectSkillPlan(["React", "SQL"], ["React", "SQL"], ["React"]).action, "filter");
});

test("a short list (an old link) can be built back up on a project with four saved", () => {
  assert.equal(projectSkillPlan(four, ["React", "SQL"], ["React", "SQL", "Go"]).action, "filter");
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
  // Remote: the city is the preferred work location; clearing it clears that.
  assert.deepEqual(projectCityPlan("pune", { locationType: "remote", state: null }, districts), { action: "save", body: { preferredLocations: ["Pune"] }, label: "Pune" });
  assert.deepEqual(projectCityPlan("", { locationType: "remote", state: null }, districts), { action: "save", body: { preferredLocations: [] }, label: "" });
  assert.equal(projectCityPlan("Atlantis", { locationType: "remote", state: null }, districts).action, "skip");
});

test("a live project's city and state can be edited, its work mode cannot", () => {
  assert.equal(isLockedWhilePublished("city"), false);
  assert.equal(isLockedWhilePublished("state"), false);
  assert.equal(isLockedWhilePublished("locationType"), true);
});
