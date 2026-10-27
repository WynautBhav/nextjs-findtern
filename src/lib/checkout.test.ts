import assert from "node:assert/strict";
import { test } from "node:test";

import { buildOffer, parseOffer } from "./offer.ts";
import { fullTimeFeeMinor, lineCharge, PER_HIRE_MINOR } from "./checkout.ts";

const newOffer = () =>
  parseOffer(
    buildOffer({
      currency: "INR",
      roleTitle: "Backend intern",
      mode: "remote",
      startDate: "2026-11-02",
      duration: "3m",
      monthlyHours: 160,
      hourlyRateMinor: 10_000,
      perHireMinor: PER_HIRE_MINOR.INR,
    }),
    "INR",
  );

test("DB-30: a new offer stores the fee in both perHireCharge and totalPrice", () => {
  const o = newOffer();
  assert.equal(o.perHireMinor, 500_000);
  assert.equal(o.monthlyMinor, 1_600_000);
  assert.equal(o.totalMinor, 1_600_000 * 3 + 500_000);
});

test("DB-30: upfront charges exactly totalPrice, the fee once", () => {
  const o = newOffer();
  assert.equal(lineCharge(o, 8, "upfront").totalMinor, o.totalMinor);
});

test("DB-30: paying month by month adds up to totalPrice, the fee only in month one", () => {
  const o = newOffer();
  const first = lineCharge(o, 8, "monthly").totalMinor;
  const later = lineCharge(o, 8, "monthly", { firstPayment: false }).totalMinor;
  assert.equal(first, 1_600_000 + 500_000);
  assert.equal(later, 1_600_000);
  assert.equal(first + later * (o.months - 1), o.totalMinor);
});

test("EMH-11: placement ledger, monthly plan one of three months paid", async () => {
  const { placementLedger } = await import("./dues.ts");
  const offerDetails = buildOffer({
    currency: "INR",
    roleTitle: "Backend intern",
    mode: "remote",
    startDate: "2026-11-02",
    duration: "3m",
    monthlyHours: 160,
    hourlyRateMinor: 10_000,
    perHireMinor: PER_HIRE_MINOR.INR,
  });
  const hire = { id: "p1", status: "hired", offerDetails, currency: "INR" };
  const l = placementLedger(hire, [
    { status: "paid", paidAt: "2026-11-01T06:00:00Z", raw: { notes: { proposalIds: ["p1"], paymentMode: "monthly" } } },
    { status: "failed", raw: { notes: { proposalIds: ["p1"], paymentMode: "monthly" } } },
  ]);
  assert.equal(l.plan, "monthly");
  assert.equal(l.totalMinor, 1_600_000 * 3 + 500_000);
  assert.equal(l.paidMinor, 1_600_000 + 500_000);
  assert.equal(l.dueMinor, 1_600_000 * 2);
  assert.equal(l.nextDue, "2026-12-02");
  assert.equal(l.endsOn, "2027-02-02");
  assert.equal(l.status, "partially_paid");
  const upfront = placementLedger(hire, [{ status: "paid", raw: { notes: { proposalIds: ["p1"], paymentMode: "total" } } }]);
  assert.equal(upfront.status, "fully_paid");
  assert.equal(upfront.dueMinor, 0);
  assert.equal(upfront.nextDue, null);
});

test("EMH-39: the full-time fee is 8.33% of CTC in whole rupees, as legacy rounds it", () => {
  // ₹7,77,777 × 8.33% = ₹64,788.82 → ₹64,789
  assert.equal(fullTimeFeeMinor(77_777_700), 6_478_900);
  // ₹6,00,000 × 8.33% = ₹49,980 exactly
  assert.equal(fullTimeFeeMinor(60_000_000), 4_998_000);
  const c = lineCharge(parseOffer({ fullTimeOffer: { annualCtc: 777777 } }, "INR"), 8);
  assert.equal(c.totalMinor, 6_478_900);
  assert.equal(c.totalMinor % 100, 0);
});
