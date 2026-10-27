import assert from "node:assert/strict";
import { test } from "node:test";

import { describeLegacyBand, isLegacyTier, legacyBandChange, parseLegacyScoreBand } from "./plan-band.ts";
import { pickNdaClause } from "./legal-docs.ts";

test("legacy band parser matches the built-in rate card", () => {
  assert.deepEqual(parseLegacyScoreBand("6-8/10"), { min: 6, max: 8 });
  assert.deepEqual(parseLegacyScoreBand("8+/10 (Top Rated)"), { min: 8 });
  assert.equal(isLegacyTier("Under 6/10"), false, "legacy never prices the lowest plan from this row");
  assert.equal(parseLegacyScoreBand("less than 6/10").max, 6);
  assert.equal(describeLegacyBand("6-8/10"), "score 6 to below 8");
  assert.equal(describeLegacyBand("⭐ 8+/10"), "score 8 and above");
});

test("rewording a working band is refused; changing its numbers warns (DB-26)", () => {
  assert.equal(legacyBandChange("6-8/10", "6-8/10"), null);
  const broken = legacyBandChange("6-8/10", "Skilled interns");
  assert.equal(broken?.block, true);
  const moved = legacyBandChange("6-8/10", "7-9/10");
  assert.equal(moved?.block, false);
  assert.match(moved?.message ?? "", /score 7 to below 9/);
  // A row legacy ignored can be reworded freely (with a note if it becomes a band).
  assert.equal(legacyBandChange("Under 6/10", "Below 6 out of 10")?.block ?? false, false);
});

test("NDA editor opens the first active clause (ADP-14)", () => {
  const clauses = [
    { id: "a", isActive: false, sortOrder: 0 },
    { id: "b", isActive: true, sortOrder: 1 },
  ];
  assert.equal(pickNdaClause(clauses)?.id, "b");
  assert.equal(pickNdaClause([{ id: "x", isActive: false }])?.id, "x");
  assert.equal(pickNdaClause([]), null);
});
