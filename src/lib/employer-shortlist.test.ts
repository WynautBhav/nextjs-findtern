import assert from "node:assert/strict";
import { test } from "node:test";

import { shortlistProjectsByIntern } from "./employer-shortlist.ts";

test("groups project names per intern, de-duplicated and sorted", () => {
  const m = shortlistProjectsByIntern([
    { internId: "a", projectName: "Zeta" },
    { internId: "a", projectName: "alpha" },
    { internId: "a", projectName: "ZETA" },
    { internId: "b", projectName: "Beta" },
    { internId: "b", projectName: "  " },
  ]);
  assert.deepEqual(m.get("a"), ["alpha", "Zeta"]);
  assert.deepEqual(m.get("b"), ["Beta"]);
  assert.equal(m.get("c"), undefined);
});
