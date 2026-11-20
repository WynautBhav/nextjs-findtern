import assert from "node:assert/strict";
import { test } from "node:test";

import { mainAction, rankAxes, splitSkills } from "./profile-helpers.ts";

test("splitSkills matches on the base name, ignoring level and case, and keeps order", () => {
  const r = splitSkills(["Node.js", "React · Advanced", "figma", "Python"], ["react", "Figma · Basic", "GraphQL"]);
  assert.deepEqual(r.matches, ["React · Advanced", "figma"]);
  assert.deepEqual(r.others, ["Node.js", "Python"]);
});

test("splitSkills with no project asks nothing of anyone", () => {
  assert.deepEqual(splitSkills(["A", "B"], []), { matches: [], others: ["A", "B"] });
  assert.deepEqual(splitSkills([], ["A"]), { matches: [], others: [] });
});

test("rankAxes sorts high to low, ties and unrated keep their order, unrated last", () => {
  const out = rankAxes([
    { label: "Communication", value: 7 },
    { label: "Coding", value: null },
    { label: "Aptitude", value: 9 },
    { label: "AI interview", value: 7 },
  ]);
  assert.deepEqual(out.map((a) => a.label), ["Aptitude", "Communication", "AI interview", "Coding"]);
});

test("rankAxes does not mutate its input", () => {
  const axes = [{ value: 1 }, { value: 2 }];
  rankAxes(axes);
  assert.deepEqual(axes, [{ value: 1 }, { value: 2 }]);
});

test("mainAction follows the rail's order: send, view, placement, reason", () => {
  assert.deepEqual(mainAction({ kind: "send" }, null), { kind: "send" });
  assert.deepEqual(mainAction({ kind: "view", proposalId: "p" }, null), { kind: "view", proposalId: "p" });
  assert.deepEqual(mainAction({ kind: "blocked", reason: "r" }, { hired: true, proposal: { id: "h" } }), { kind: "placement", proposalId: "h" });
  assert.equal(mainAction({ kind: "blocked", reason: "r" }, { hired: true, proposal: null }), null);
  assert.deepEqual(mainAction({ kind: "blocked", reason: "Finish the interview first." }, { hired: false, proposal: null }), { kind: "reason", text: "Finish the interview first." });
});
