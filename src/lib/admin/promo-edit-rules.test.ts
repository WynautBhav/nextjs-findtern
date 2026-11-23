import assert from "node:assert/strict";
import { test } from "node:test";

import { fullDiscountUsesWaiver, promoCodeProblem, promoDiscountProblem, promoNumberFields } from "./promo-edit-rules.ts";

test("a percentage above 100 is refused", () => {
  assert.match(promoDiscountProblem({ discountType: "percentage", discountValue: 150, appliesTo: "intern" }) ?? "", /more than 100/);
});

test("100% is for intern codes only", () => {
  assert.match(promoDiscountProblem({ discountType: "percentage", discountValue: 100, appliesTo: "employer" }) ?? "", /intern code/);
  assert.equal(promoDiscountProblem({ discountType: "percentage", discountValue: 100, appliesTo: "intern" }), null);
});

test("edit merge: raising an existing employer code to 100 is caught, and flipping a 100% intern code to employer is too", () => {
  const existing = { discountType: "percentage", discountValue: 40, appliesTo: "employer" };
  assert.ok(promoDiscountProblem({ ...existing, ...{ discountValue: 100 } }));
  const intern100 = { discountType: "percentage", discountValue: 100, appliesTo: "intern" };
  assert.ok(promoDiscountProblem({ ...intern100, ...{ appliesTo: "employer" } }));
  // changing only the type to percentage on a fixed 500 code is 500% and refused
  assert.ok(promoDiscountProblem({ ...{ discountType: "fixed", discountValue: 500, appliesTo: "intern" }, ...{ discountType: "percentage" } }));
});

test("fixed amounts and sane percentages pass; zero or missing is refused", () => {
  assert.equal(promoDiscountProblem({ discountType: "fixed", discountValue: 50000, appliesTo: "employer" }), null);
  assert.equal(promoDiscountProblem({ discountType: "percentage", discountValue: 25, appliesTo: "employer" }), null);
  assert.ok(promoDiscountProblem({ discountType: "percentage", discountValue: 0, appliesTo: "intern" }));
  assert.ok(promoDiscountProblem({ discountType: "percentage", appliesTo: "intern" }));
});

test("code length and characters", () => {
  assert.equal(promoCodeProblem("FB1INT10"), null);
  assert.equal(promoCodeProblem("a-b_c"), null);
  assert.ok(promoCodeProblem("ab"));
  assert.ok(promoCodeProblem("A".repeat(33)));
  assert.ok(promoCodeProblem("HELLO WORLD"));
  assert.ok(promoCodeProblem("PROMO!"));
});

test("a 100% Findtern Pro subscription code is refused in words about the subscription, not the stipend, and points to the full-waiver code", () => {
  const msg = promoDiscountProblem({ discountType: "percentage", discountValue: 100, appliesTo: "subscription" }) ?? "";
  assert.match(msg, /subscription/i);
  assert.match(msg, /full-waiver/i);
  assert.doesNotMatch(msg, /stipend/i);
  // the employer wording is unchanged
  assert.match(promoDiscountProblem({ discountType: "percentage", discountValue: 100, appliesTo: "employer" }) ?? "", /stipend/);
});

test("a 100% code for any audience but intern is made as a full-waiver code, the one code that may make a payment free", () => {
  for (const appliesTo of ["employer", "both", "subscription"]) {
    assert.equal(fullDiscountUsesWaiver({ discountType: "percentage", discountValue: 100, appliesTo }), true, appliesTo);
  }
  // intern 100% is an ordinary code (its activation settles free); anything under 100%, and fixed amounts, are ordinary too
  assert.equal(fullDiscountUsesWaiver({ discountType: "percentage", discountValue: 100, appliesTo: "intern" }), false);
  assert.equal(fullDiscountUsesWaiver({ discountType: "percentage", discountValue: 99, appliesTo: "employer" }), false);
  assert.equal(fullDiscountUsesWaiver({ discountType: "fixed", discountValue: 100, appliesTo: "employer" }), false);
  // so every audience the form offers can end up with a 100% code
  for (const appliesTo of ["intern", "employer", "both", "subscription"]) {
    const input = { discountType: "percentage", discountValue: 100, appliesTo };
    assert.ok(fullDiscountUsesWaiver(input) || promoDiscountProblem(input) === null, appliesTo);
  }
});

// The columns are 32-bit integers: a bigger number used to reach the insert and come back as an empty 500.
test("promo numbers above the integer column are refused with a message, not stored", () => {
  const max = 2_147_483_647;
  assert.equal(promoNumberFields.discountValue.safeParse(max).success, true);
  assert.equal(promoNumberFields.maxUsages.safeParse(max).success, true);
  assert.equal(promoNumberFields.minOrderAmountMinor.safeParse(max).success, true);
  for (const [name, schema] of Object.entries(promoNumberFields)) {
    const r = schema.safeParse(max + 1);
    assert.equal(r.success, false, name);
    assert.match(r.success ? "" : r.error.issues[0].message, /too large|at most/i, name);
  }
});
