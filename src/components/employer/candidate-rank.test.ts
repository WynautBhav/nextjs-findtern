import assert from "node:assert/strict";
import { test } from "node:test";

import { rankProfiles, type RankOptions, type Rankable } from "./candidate-rank.ts";

const make = (id: string, score: number, extra: Partial<Rankable> = {}): Rankable => ({
  id,
  initials: id.toUpperCase(),
  score,
  ratings: { communication: 5, coding: 5, aptitude: 5, interview: 5 },
  skills: [],
  preferredLocations: [],
  ...extra,
});

const base: RankOptions = { sorts: [], dir: "desc", skillTerms: [], skillPriority: true, cities: [], saved: new Set() };
const ids = (list: Rankable[]) => list.map((p) => p.id);

test("no saves: Findtern Score high to low, initials break ties", () => {
  const out = rankProfiles([make("b", 7), make("a", 7), make("c", 9)], base);
  assert.deepEqual(ids(out), ["c", "a", "b"]);
});

test("a saved role leads when no explicit sort is chosen, even against a higher score", () => {
  const out = rankProfiles([make("hi", 9), make("mid", 7), make("saved", 6.1)], { ...base, saved: new Set(["saved"]) });
  assert.deepEqual(ids(out), ["saved", "hi", "mid"]);
});

test("saved interns are still ordered by score among themselves", () => {
  const out = rankProfiles([make("a", 6.5), make("b", 8), make("c", 9)], { ...base, saved: new Set(["a", "b"]) });
  assert.deepEqual(ids(out), ["b", "a", "c"]);
});

test("an explicit sort leads: saved does not jump the queue", () => {
  const list = [make("a", 6, { ratings: { communication: 9, coding: 1, aptitude: 1, interview: 1 } }), make("b", 8), make("c", 7)];
  const out = rankProfiles(list, { ...base, sorts: ["communication"], saved: new Set(["c"]) });
  assert.deepEqual(ids(out), ["a", "b", "c"]);
});

test("explicit sort, low to high", () => {
  const out = rankProfiles([make("a", 8), make("b", 6), make("c", 7)], { ...base, sorts: ["score"], dir: "asc" });
  assert.deepEqual(ids(out), ["b", "c", "a"]);
});

test("saved outranks matched skills; matched skills outrank score", () => {
  const list = [
    make("none", 9),
    make("two", 6, { skills: ["React", "Node"] }),
    make("savedOnly", 5),
  ];
  const out = rankProfiles(list, { ...base, skillTerms: ["react", "node"], saved: new Set(["savedOnly"]) });
  assert.deepEqual(ids(out), ["savedOnly", "two", "none"]);
});

test("does not mutate its input", () => {
  const list = [make("a", 1), make("b", 2)];
  rankProfiles(list, base);
  assert.deepEqual(ids(list), ["a", "b"]);
});
