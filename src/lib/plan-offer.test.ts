import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scheduledMonthlyHours } from "./offer.ts";
import { HOURS_PER_MONTH, perHireFreeForNow, planHasOffer } from "./plan-offer.ts";

describe("plan offer", () => {
  it("is on when a compare-at price sits above the current price", () => {
    assert.equal(
      planHasOffer({ priceHourlyMinor: 0, compareAtHourlyMinor: 5000, perHireChargeMinor: 500000, compareAtPerHireMinor: null }),
      true,
    );
    assert.equal(
      planHasOffer({ priceHourlyMinor: 10000, compareAtHourlyMinor: null, perHireChargeMinor: 500000, compareAtPerHireMinor: null }),
      false,
    );
    // A compare-at at or below the price is not an offer.
    assert.equal(
      planHasOffer({ priceHourlyMinor: 10000, compareAtHourlyMinor: 10000, perHireChargeMinor: 500000, compareAtPerHireMinor: 400000 }),
      false,
    );
  });
});

describe("monthly arithmetic", () => {
  it("marketing hours equal the hours a real Mon-Fri / Mon-Sat offer bills", () => {
    assert.equal(HOURS_PER_MONTH, 176);
    assert.equal(HOURS_PER_MONTH, scheduledMonthlyHours("mon_fri", 0));
    assert.equal(scheduledMonthlyHours("mon_sat", 0), 208);
  });
});

describe("per-hire free for now (follows the admin setting)", () => {
  it("applies to Cappuccino and Latte, never Espresso", () => {
    assert.equal(perHireFreeForNow("cappuccino"), true);
    assert.equal(perHireFreeForNow("latte"), true);
    assert.equal(perHireFreeForNow("skilled"), true);
    assert.equal(perHireFreeForNow("assured"), true);
    assert.equal(perHireFreeForNow("espresso"), false);
    assert.equal(perHireFreeForNow("standard"), false);
    assert.equal(perHireFreeForNow(undefined), false);
    // Follows the setting passed in, not a fixed list.
    assert.equal(perHireFreeForNow("latte", { standard: true, skilled: true, assured: true }), false);
    assert.equal(perHireFreeForNow("espresso", { standard: false, skilled: false, assured: false }), true);
  });
});
