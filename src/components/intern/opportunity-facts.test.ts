import { test } from "node:test";
import assert from "node:assert/strict";

import { matchSkills, roleFacts, roleScope } from "./opportunity-facts.ts";

test("scope: a duration code becomes words, never the raw code", () => {
  assert.deepEqual(roleScope("short-term"), { duration: "Up to 60 days", brief: null });
  assert.deepEqual(roleScope("medium-term"), { duration: "Up to 90 days", brief: null });
});

test("scope: legacy prose is a brief, not a duration", () => {
  assert.deepEqual(roleScope("Build the ops dashboard."), { duration: null, brief: "Build the ops dashboard." });
  assert.deepEqual(roleScope("  "), { duration: null, brief: null });
});

test("facts line: mode label, no city for remote, duration, no raw enum", () => {
  const line = roleFacts({ id: "1", projectName: "X", locationType: "remote", city: "Jaipur", scopeOfWork: "long-term", createdAt: null });
  assert.equal(line, "Remote · Up to 180 days");
  const onsite = roleFacts({ id: "1", projectName: "X", locationType: "onsite", city: "Jaipur", state: "Rajasthan", createdAt: null });
  assert.equal(onsite, "On-site · Jaipur, Rajasthan");
});

test("skills: the candidate's own first, at most seven shown, the rest counted", () => {
  const skills = ["A", "B", "C", "D", "E", "F", "G", "H", "React"];
  const m = matchSkills(skills, new Set(["react", "b"]));
  assert.equal(m.shown.length, 7);
  assert.equal(m.more, 2);
  assert.deepEqual(m.shown.slice(0, 2), ["B", "React"]);
  assert.equal(m.matched, 2);
  assert.equal(matchSkills(["A"], undefined).matched, 0);
});
