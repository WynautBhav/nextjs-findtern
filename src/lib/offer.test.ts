import assert from "node:assert/strict";
import { test } from "node:test";

import { buildOffer, internStipendInrMinor, parseOffer } from "./offer.ts";
import { lineCharge } from "./checkout.ts";
import { monthlyDues } from "./dues.ts";

// A row exactly as the legacy send-proposal page writes it (major units).
const legacyRow = {
  roleTitle: "Frontend intern",
  mode: "remote",
  currency: "INR",
  duration: "3m",
  monthlyHours: 120,
  monthlyAmount: 12000,
  totalPrice: 36000,
  hourlyRate: 100,
  perHireCharge: 0,
  paidLeavesPerMonth: 2,
};

test("parseOffer reads legacy major units as minor units", () => {
  const o = parseOffer(legacyRow, "INR");
  assert.equal(o.monthlyMinor, 1_200_000);
  assert.equal(o.totalMinor, 3_600_000);
  assert.equal(o.hourlyRateMinor, 10_000);
  assert.equal(o.perHireMinor, 0);
  assert.equal(o.months, 3);
});

test("missing money stays null, never a made-up default", () => {
  const o = parseOffer({ roleTitle: "x" }, "INR");
  assert.equal(o.monthlyMinor, null);
  assert.equal(internStipendInrMinor(o), null);
});

test("intern stipend is shown in INR, USD converted at 100", () => {
  assert.equal(internStipendInrMinor(parseOffer({ monthlyAmount: 120 }, "USD")), 1_200_000);
});

test("buildOffer writes the legacy shape and round-trips", () => {
  const raw = buildOffer({
    currency: "INR",
    roleTitle: "Data intern",
    mode: "hybrid",
    location: "Jaipur",
    startDate: "2026-11-01",
    duration: "2m",
    monthlyHours: 100,
    hourlyRateMinor: 15_000,
    perHireMinor: 0,
  });
  assert.equal(raw.monthlyAmount, 15_000);
  assert.equal(raw.totalPrice, 30_000);
  const o = parseOffer(raw, "INR");
  assert.equal(o.monthlyMinor, 1_500_000);
  assert.equal(o.location, "Jaipur");
});

test("checkout: score 6+ multi-month upfront gets 10% off, no per-hire", () => {
  const c = lineCharge(parseOffer(legacyRow, "INR"), 7);
  assert.equal(c.baseMinor, 3_600_000);
  assert.equal(c.discountMinor, 360_000);
  assert.equal(c.totalMinor, 3_240_000);
  assert.equal(c.monthlyBlocked, null);
});

test("checkout: below 6 pays flat per-hire, no discount, no monthly", () => {
  const c = lineCharge(parseOffer({ monthlyAmount: 0, duration: "1m" }, "INR"), 4);
  assert.equal(c.totalMinor, 500_000);
  assert.ok(c.monthlyBlocked);
});

test("checkout: monthly mode is one month of the stipend", () => {
  const c = lineCharge(parseOffer(legacyRow, "INR"), 8, "monthly");
  assert.equal(c.totalMinor, 1_200_000);
});

test("checkout: full-time offer is 8.33% of CTC", () => {
  const c = lineCharge(parseOffer({ fullTimeOffer: { annualCtc: 600000 } }, "INR"), 8);
  assert.equal(c.totalMinor, Math.round(60_000_000 * 0.0833));
});


test("monthly dues: one of three months paid leaves the next month due", () => {
  const dues = monthlyDues(
    [{ id: "p1", status: "hired", offerDetails: { duration: "3m" } }],
    [
      { status: "paid", raw: { notes: { proposalIds: ["p1"], paymentMode: "monthly" } } },
      { status: "paid", raw: { notes: { proposalIds: ["p1"], paymentMode: "upfront" } } },
    ],
  );
  assert.deepEqual(dues, [{ proposalId: "p1", monthsPaid: 1, months: 3 }]);
});
