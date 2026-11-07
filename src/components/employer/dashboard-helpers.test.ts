import test from "node:test";
import assert from "node:assert/strict";
import { bestProjectFor } from "./dashboard-helpers.ts";

const projects = [
  { id: "a", projectName: "A", skills: ["React", "CSS"] },
  { id: "b", projectName: "B", skills: ["Python", "SQL", "React"] },
];

test("picks the project with most matched skills", () => {
  const r = bestProjectFor(["python", "sql"], projects);
  assert.equal(r?.project.id, "b");
  assert.equal(r?.matched, 2);
});
test("first wins ties", () => assert.equal(bestProjectFor(["react"], projects)?.project.id, "a"));
test("null when nothing shared", () => assert.equal(bestProjectFor(["go"], projects), null));
