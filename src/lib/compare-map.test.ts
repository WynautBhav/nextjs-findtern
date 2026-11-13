import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_COMPARE, MAX_COMPARE_PROJECTS, parseIds, readCompareMap, serializeCompareMap, writeCompareMap } from "./compare-map.ts";

const E = "emp1";

test("each project keeps its own picks", () => {
  let map: Record<string, string[]> = writeCompareMap({}, "p1", ["a", "b"]);
  map = writeCompareMap(map, "p2", ["c"]);
  assert.deepEqual(map, { p1: ["a", "b"], p2: ["c"] });
  const back: Record<string, string[] | undefined> = readCompareMap(serializeCompareMap(E, map), E);
  assert.deepEqual(back, map);
  assert.deepEqual(back.p1, ["a", "b"]);
  assert.equal(back.p3, undefined);
});

test("an empty list clears that project only, and an empty map clears the cookie", () => {
  const map = writeCompareMap({ p1: ["a"], p2: ["b"] }, "p1", []);
  assert.deepEqual(map, { p2: ["b"] });
  assert.equal(serializeCompareMap(E, writeCompareMap(map, "p2", [])), null);
});

test("at most four ids per project, de-duplicated", () => {
  const map = writeCompareMap({}, "p1", ["a", "b", "a", "c", "d", "e", "f"]);
  assert.deepEqual(map.p1, ["a", "b", "c", "d"]);
  assert.equal(MAX_COMPARE, 4);
  assert.deepEqual(parseIds(" x , ,y,x"), ["x", "y"]);
});

test("at most ten projects: the one touched longest ago drops", () => {
  let map: Record<string, string[]> = {};
  for (let i = 0; i < 12; i++) map = writeCompareMap(map, `p${i}`, [`i${i}`]);
  assert.equal(Object.keys(map).length, MAX_COMPARE_PROJECTS);
  assert.equal(map.p0, undefined);
  assert.equal(map.p1, undefined);
  assert.deepEqual(map.p11, ["i11"]);
  // Touching an old one makes it the newest.
  map = writeCompareMap(map, "p2", ["x"]);
  map = writeCompareMap(map, "new", ["y"]);
  assert.deepEqual(map.p2, ["x"]);
  assert.equal(map.p3, undefined);
});

test("another employer's cookie, junk and bad shapes read as empty", () => {
  assert.deepEqual(readCompareMap('other:{"p1":["a"]}', E), {});
  assert.deepEqual(readCompareMap(`${E}:{not json`, E), {});
  assert.deepEqual(readCompareMap(`${E}:["a"]`, E), {});
  assert.deepEqual(readCompareMap(`${E}:{"p1":"a","p2":[1,"b"],"p3":[]}`, E), { p2: ["b"] });
  assert.deepEqual(readCompareMap("", E), {});
  assert.deepEqual(readCompareMap(undefined, E), {});
});

test("the old one-list cookie goes to the project that was open, or is dropped", () => {
  assert.deepEqual(readCompareMap(`${E}:a,b,c`, E, "p1"), { p1: ["a", "b", "c"] });
  assert.deepEqual(readCompareMap(`${E}:a,b`, E, null), {});
  assert.deepEqual(readCompareMap(`${E}:`, E, "p1"), {});
});
