import assert from "node:assert/strict";
import { test } from "node:test";

import { readSkills } from "./employer-candidates.ts";

test("readSkills never carries a skill level, even from legacy {name, level} rows", () => {
  assert.deepEqual(readSkills([{ name: "React", level: "Advanced" }, "SQL", { name: "Go", rating: 3 }]), ["React", "SQL", "Go"]);
});
