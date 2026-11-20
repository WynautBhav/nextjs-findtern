import assert from "node:assert/strict";
import { test } from "node:test";

import { rankSuggestions, searchHref } from "./candidate-suggest.ts";

test("skills come first, then cities, capped at max", () => {
  const r = rankSuggestions(["React", "React Native", "Redux"], ["Reading", "Redhill"], { max: 4 });
  assert.deepEqual(r.all.map((s) => s.label), ["React", "React Native", "Reading", "Redhill"]);
  assert.equal(r.all.length, 4);
});

test("a short group hands its room to the other", () => {
  const r = rankSuggestions(["Pune"], ["Pune", "Punjab", "Puducherry", "Punch"], { max: 6 });
  assert.equal(r.skills.length, 1);
  assert.equal(r.cities.length, 4);
});

test("already-required skills offer no + Require; duplicates collapse; cities never do", () => {
  const r = rankSuggestions(["React", "react", "Node.js"], ["Pune", "pune"], { required: ["REACT"] });
  assert.deepEqual(r.skills.map((s) => [s.label, s.canRequire]), [["React", false], ["Node.js", true]]);
  assert.deepEqual(r.cities.map((s) => [s.label, s.canRequire]), [["Pune", false]]);
});

test("nothing typed means nothing offered", () => {
  assert.equal(rankSuggestions([], []).all.length, 0);
});

test("searchHref sets, trims and clears q, keeps the other filters, resets the page", () => {
  const P = "/employer/candidates";
  assert.equal(searchHref(P, "min=6&project=p1", "  React "), `${P}?min=6&project=p1&q=React`);
  assert.equal(searchHref(P, "min=6&q=old&page=3", "Pune"), `${P}?min=6&q=Pune`);
  assert.equal(searchHref(P, "q=old&min=6", "  "), `${P}?min=6`);
  assert.equal(searchHref(P, "", ""), P);
});
