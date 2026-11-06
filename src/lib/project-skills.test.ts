import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveProjectSkills } from "./project-locations.ts";
import { canonicalSkill } from "./data/skills.ts";

test("canonicalSkill is case-insensitive and returns the list's spelling", () => {
  const react = canonicalSkill("REACT");
  assert.ok(react);
  assert.equal(react?.toLowerCase(), "react");
  assert.equal(canonicalSkill("  not-a-real-skill-xyz "), null);
});

test("unknown skills are rejected with their names", () => {
  const r = resolveProjectSkills(["React", "Zzqx Wizardry", "Excel", "Figma"]);
  assert.match(r.error ?? "", /Pick skills from the list: Zzqx Wizardry/);
});

test("known skills are stored in the canonical spelling, once each", () => {
  const r = resolveProjectSkills(["react", "REACT", "excel"]);
  assert.equal(r.error, null);
  assert.equal(r.skills.length, 2);
  assert.equal(r.skills[0], canonicalSkill("react"));
});

test("a skill the project already has stays editable even if it is free text", () => {
  const r = resolveProjectSkills(["Legacy Thing", "React"], ["Legacy Thing"]);
  assert.equal(r.error, null);
  assert.deepEqual(r.skills[0], "Legacy Thing");
});
