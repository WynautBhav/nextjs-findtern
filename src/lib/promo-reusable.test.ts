import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { collegeCodeEditProblem } from "./promo-rules.ts";

// Owner, 23 Nov: for testing, one employer can use the same promo code more than once when the code is marked reusable.
const read = (f: string) => readFileSync(f, "utf8");

test("the one-per-account refusal is skipped only for a reusable code, in the quote and in the full-waiver settle", () => {
  assert.match(read("src/lib/promo.ts"), /if \(priorUse && !row\.reusable\) return/);
  assert.match(read("src/lib/full-waiver-settle.ts"), /alreadyUsedByAccount: Boolean\(prior\) && !row\.reusable/);
});

test("each use records whether it was single-use, so the database keeps one-per-account for ordinary codes", () => {
  assert.match(read("src/lib/promo.ts"), /singleUse: !promo\.reusable/);
  assert.match(read("src/lib/full-waiver-settle.ts"), /singleUse: !row\.reusable/);
  const sql = read("drizzle/0052_reusable_promo.sql");
  assert.match(sql, /"promo_code_usages_unique" ON "promo_code_usages" USING btree \("promo_code_id","user_id"\) WHERE "single_use"/);
  // A reusable code still counts a twice-settled order once.
  assert.match(sql, /"promo_code_usages_order_unique" ON "promo_code_usages" USING btree \("promo_code_id","order_id"\) WHERE NOT "single_use"/);
});

test("a college's code can't be made reusable (its seats are one per student)", () => {
  const existing = { collegeId: "c1", discountType: "percentage", discountValue: 100, appliesTo: "intern", maxUsages: 300 };
  assert.ok(collegeCodeEditProblem(existing, { reusable: true }));
  assert.equal(collegeCodeEditProblem(existing, { reusable: false }), null);
  assert.equal(collegeCodeEditProblem({ ...existing, collegeId: null }, { reusable: true }), null);
});

test("both admin create routes and the edit route accept the switch", () => {
  assert.match(read("src/app/api/admin/promo-codes/route.ts"), /reusable: z\.boolean\(\)\.default\(false\)/);
  assert.match(read("src/app/api/admin/promo-codes/[id]/route.ts"), /reusable: z\.boolean\(\)\.optional\(\)/);
  assert.match(read("src/app/api/admin/promo-codes/full-waiver/route.ts"), /reusable: body\.reusable \?\? false/);
});
