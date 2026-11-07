import test from "node:test";
import assert from "node:assert/strict";
import { skillMatch } from "./skill-match.ts";

test("skillMatch basics", () => {
  const r = skillMatch([" react ", "SQL", "go"], ["React", "sql", "Python", "react"]);
  assert.deepEqual(r.matched, ["React", "sql"]);
  assert.deepEqual(r.missing, ["Python"]);
  assert.equal(r.total, 3);
});
test("skillMatch caps at 7 and handles empty", () => {
  const w = Array.from({ length: 10 }, (_, i) => `s${i}`);
  assert.equal(skillMatch(w, w).total, 7);
  assert.deepEqual(skillMatch([], []), { matched: [], missing: [], total: 0 });
});
