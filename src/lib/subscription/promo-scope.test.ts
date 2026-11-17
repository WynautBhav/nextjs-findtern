import assert from "node:assert/strict";
import test from "node:test";

import { FULL_WAIVER_TYPE, waiverCreateProblem, waiverRedeemProblem } from "../full-waiver.ts";
import { employerPromoTooLarge, promoAudienceProblem, PROMO_APPLIES_TO, promoDiscount, type PromoRow } from "../promo-rules.ts";
import { scopeAllows } from "../promo-scope.ts";

/**
 * Which promo codes apply to which payment. Conservative: a code made for hiring (intern, employer, both) never
 * discounts the Findtern Pro subscription, and a code scoped "subscription" never discounts a hire or an activation.
 */

const AUDIENCES = ["intern", "employer", "subscription"] as const;
const SCOPES = ["intern", "employer", "both", "subscription", null, undefined] as const;

test("scope matrix: every scope against every kind of payment", () => {
  const expected: Record<string, Record<string, boolean>> = {
    intern: { intern: true, employer: false, subscription: false },
    employer: { intern: false, employer: true, subscription: false },
    both: { intern: true, employer: true, subscription: false },
    subscription: { intern: false, employer: false, subscription: true },
    // A missing scope reads as "both", as it always has.
    null: { intern: true, employer: true, subscription: false },
    undefined: { intern: true, employer: true, subscription: false },
  };
  for (const scope of SCOPES) {
    for (const audience of AUDIENCES) {
      assert.equal(scopeAllows(scope, audience), expected[String(scope)][audience], `${String(scope)} on ${audience}`);
      assert.equal(promoAudienceProblem(scope, audience) === null, expected[String(scope)][audience], `problem(${String(scope)}, ${audience})`);
    }
  }
});

test("the admin can pick the subscription scope", () => {
  assert.deepEqual([...PROMO_APPLIES_TO], ["intern", "employer", "both", "subscription"]);
});

test("refusal copy tells the employer why, and never mentions a wrong audience", () => {
  assert.equal(promoAudienceProblem("employer", "subscription"), "This code is for hiring payments, not the Findtern Pro subscription");
  assert.equal(promoAudienceProblem("both", "subscription"), "This code is for hiring payments, not the Findtern Pro subscription");
  assert.equal(promoAudienceProblem("subscription", "employer"), "This code is only for the Findtern Pro subscription");
  assert.equal(promoAudienceProblem("subscription", "intern"), "This code is only for the Findtern Pro subscription");
  // Unchanged from before: the two hiring audiences.
  assert.equal(promoAudienceProblem("intern", "employer"), "This code is for interns only");
  assert.equal(promoAudienceProblem("employer", "intern"), "This code is for companies only");
});

const pct = (value: number): PromoRow => ({ code: "PRO20", discountType: "percentage", discountValue: value, maxUsages: null, usedCount: 0, minOrderAmountMinor: null, validFrom: null, validUntil: null, isActive: true });

test("percent and flat discounts on the Rs 10,000 price round exactly as on any order", () => {
  assert.equal(promoDiscount(pct(20), 1_000_000, "INR"), 200_000);
  assert.equal(promoDiscount(pct(15), 1_000_001, "INR"), 150_000); // rounds down to the paisa
  assert.equal(promoDiscount({ ...pct(0), discountType: "fixed", discountValue: 250_000 }, 1_000_000, "INR"), 250_000);
  // USD: Rs 10,000 = $100; a Rs 2,500 flat code is $25.
  assert.equal(promoDiscount(pct(20), 10_000, "USD"), 2_000);
  assert.equal(promoDiscount({ ...pct(0), discountType: "fixed", discountValue: 250_000 }, 10_000, "USD"), 2_500);
});

test("a subscription code that would take the whole price is too large; a full waiver is the way to give it free", () => {
  assert.equal(employerPromoTooLarge(promoDiscount(pct(100), 1_000_000, "INR"), 1_000_000), true);
  assert.equal(employerPromoTooLarge(promoDiscount(pct(99), 1_000_000, "INR"), 1_000_000), false);
  assert.equal(promoDiscount({ discountType: FULL_WAIVER_TYPE } as PromoRow, 1_000_000, "INR"), 1_000_000);
});

const waiver = { discountType: FULL_WAIVER_TYPE, isActive: true, validFrom: null, validUntil: new Date("2026-11-20T00:00:00Z"), maxUsages: 5, usedCount: 0 };
const NOW = new Date("2026-11-17T10:00:00Z");
const redeem = (appliesTo: string | null, audience: "employer" | "intern" | "subscription") => waiverRedeemProblem({ ...waiver, appliesTo }, { audience, alreadyUsedByAccount: false, now: NOW });

test("a full-waiver code redeems on the payment its audience names, and on no other", () => {
  assert.equal(redeem("subscription", "subscription"), null);
  assert.equal(redeem("employer", "employer"), null);
  assert.equal(redeem("both", "employer"), null);
  assert.equal(redeem("both", "intern"), null);
  assert.ok(redeem("subscription", "employer"), "a subscription waiver must not free a hire");
  assert.ok(redeem("subscription", "intern"));
  assert.ok(redeem("employer", "subscription"), "a hiring waiver must not free a subscription");
  assert.ok(redeem("both", "subscription"));
  assert.ok(redeem(null, "subscription"));
});

test("the waiver generator accepts the subscription audience", () => {
  const ok = { maxUsages: 1, validUntil: new Date(NOW.getTime() + 86_400_000), now: NOW };
  assert.equal(waiverCreateProblem({ ...ok, appliesTo: "subscription" }), null);
  assert.equal(waiverCreateProblem({ ...ok, appliesTo: "employer" }), null);
  assert.match(waiverCreateProblem({ ...ok, appliesTo: "college" }) ?? "", /who can use/i);
});
