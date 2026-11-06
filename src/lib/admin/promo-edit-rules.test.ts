import assert from "node:assert/strict";
import { test } from "node:test";

import { promoCodeProblem, promoDiscountProblem } from "./promo-edit-rules.ts";

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
