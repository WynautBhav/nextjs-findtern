import assert from "node:assert/strict";
import { test } from "node:test";

import { groupByCandidate, projectsLabel } from "./shortlist-group.ts";

const line = (candidate: string, projectId: string, projectName: string | null = `Name ${projectId}`) => ({
  candidate: { id: candidate },
  projectId,
  projectName,
});

test("groupByCandidate: one group per person, first-seen order, primary is the first line", () => {
  const a1 = line("A", "P1");
  const a2 = line("A", "P2");
  const b1 = line("B", "P1");
  const a3 = line("A", "P3");
  const groups = groupByCandidate([a1, b1, a2, a3]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].primary, a1);
  assert.deepEqual(groups[0].lines, [a1, a2, a3]);
  assert.equal(groups[1].primary, b1);
  assert.deepEqual(groups[1].lines, [b1]);
});

test("groupByCandidate: empty in, empty out", () => {
  assert.deepEqual(groupByCandidate([]), []);
});

test("projectsLabel: one, two, then +N", () => {
  assert.equal(projectsLabel([line("A", "1", "Heavy Project 55")]), "Heavy Project 55");
  assert.equal(projectsLabel([line("A", "1", "Heavy Project 55"), line("A", "2", "Heavy Project 50")]), "Heavy Project 55, Heavy Project 50");
  assert.equal(
    projectsLabel([line("A", "1", "X"), line("A", "2", "Y"), line("A", "3", "Z"), line("A", "4", "W")]),
    "X, Y +2",
  );
});
