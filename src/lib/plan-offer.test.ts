import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HOURS_PER_MONTH, monthlyCostMinor, monthlyHours, planHasOffer } from "./plan-offer.ts";

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
  it("uses 8 x 5 x 4 = 160 hours", () => {
    assert.equal(HOURS_PER_MONTH, 160);
    assert.equal(monthlyHours(8, 5), 160);
    assert.equal(monthlyHours(8, 6), 192);
    assert.equal(monthlyHours(4, 5), 80);
  });

  it("prices a month from the hourly rate", () => {
    // ₹100/hr x 160 h = ₹16,000
    assert.equal(monthlyCostMinor(10000, 8, 5), 1_600_000);
    assert.equal(monthlyCostMinor(0, 8, 5), 0);
  });
});
