import assert from "node:assert/strict";
import test from "node:test";

import { calculateHireFees, discountedMonthlyMinor, driveCountdown, ppoRate } from "./drive-pricing.ts";
import { degreeYears, fullTimeReady, isStudentEligible } from "./eligibility.ts";
import { buildOffer, parseOffer } from "../offer.ts";
import { lineCharge, fullTimeFeeMinor, fullTimeRate } from "../checkout.ts";

/** Pure pieces of the College Virtual Drives spec. The DB and HTTP cases (TC-A*, TC-B1/B2, TC-D2..D4) are in e2e/virtual-drive.e2e.mjs. */

test("TC-C1 (math): a drive offer stores 15% off and a 1% PPO fee; an open-marketplace one is standard", () => {
  assert.deepEqual(calculateHireFees({ driveId: "d1" }), { driveId: "d1", pricingTier: "virtual_drive", discountPercent: 15, ppoFeePercent: 1 });
  assert.deepEqual(calculateHireFees({ driveId: null }), { driveId: null, pricingTier: "standard", discountPercent: 0, ppoFeePercent: 8.33 });
});

test("TC-C1 (math): 15% comes off the monthly charge only, never the hiring fee, and the 10% upfront still stacks", () => {
  // ₹200/h × 168 h = ₹33,600 list; 15% off = ₹28,560.
  const raw = buildOffer({ roleTitle: "Analyst", jd: "x", mode: "remote", startDate: "2027-01-04", duration: "3m", monthlyHours: 168, hourlyRateMinor: 20_000, perHireMinor: 500_000, currency: "INR", driveDiscountPercent: 15 });
  const offer = parseOffer(raw, "INR");
  assert.equal(offer.monthlyMinor, 2_856_000);
  assert.equal(offer.listMonthlyMinor, 3_360_000);
  assert.equal(offer.driveDiscountPercent, 15);
  assert.equal(offer.totalMinor, 2_856_000 * 3 + 500_000, "the ₹5,000 hiring fee is added in full");
  const up = lineCharge(offer, 8.5, "upfront", { upfrontDiscount: { enabled: true, percent: 10, minMonths: 3 } } as never);
  assert.equal(up.perHireMinor, 500_000);
  assert.equal(up.discountMinor, Math.round(2_856_000 * 3 * 0.1), "the 10% upfront is taken off the discounted months");
  const std = parseOffer(buildOffer({ roleTitle: "Analyst", jd: "x", mode: "remote", startDate: "2027-01-04", duration: "3m", monthlyHours: 168, hourlyRateMinor: 20_000, perHireMinor: 0, currency: "INR" }), "INR");
  assert.equal(std.monthlyMinor, 3_360_000);
  assert.equal(std.driveDiscountPercent, 0);
});

test("TC-C3 (math): the stored drive PPO percent becomes a 1% fee; standard or junk stays 8.33%", () => {
  assert.equal(ppoRate("1.00"), 0.01);
  assert.equal(ppoRate(1), 0.01);
  assert.equal(ppoRate("8.33"), 0.0833);
  assert.equal(ppoRate("0"), 0.0833);
  assert.equal(ppoRate("abc"), 0.0833);
  // A full-time offer carrying the drive rate bills 1% of CTC: ₹10,00,000 CTC → ₹10,000.
  assert.equal(fullTimeFeeMinor(100_000_000, fullTimeRate({ feeRate: ppoRate("1.00") })), 1_000_000);
  assert.equal(fullTimeFeeMinor(100_000_000, fullTimeRate({ feeRate: null })), 8_330_000);
});

test("TC-C4 (math): an offer only honours a fee rate below the standard one; a tampered 0.5 or 8.33 cannot raise or zero it", () => {
  const ft = (feeRate: unknown) => parseOffer({ fullTimeOffer: { annualCtc: 1_000_000, feeRate } }, "INR").fullTime!.feeRate;
  assert.equal(ft(0.0833), null);
  assert.equal(ft(5), null);
  assert.equal(ft(-1), null);
  assert.equal(ft("0.01"), null, "a string is not a server stamp");
});

test("TC-B3 (rule): Full-time is the final year by degree: B.Tech 4th, BCA 3rd; 2nd years never", () => {
  assert.equal(degreeYears("B.Tech CSE"), 4);
  assert.equal(degreeYears("BCA"), 3);
  assert.equal(fullTimeReady({ year: 4, semester: null, branch: "B.Tech CSE" }), true);
  assert.equal(fullTimeReady({ year: 2, semester: null, branch: "B.Tech CSE" }), false);
  assert.equal(fullTimeReady({ year: 3, semester: 6, branch: "B.Tech" }), false, "a B.Tech 3rd year is not final year");
  assert.equal(fullTimeReady({ year: 3, semester: 5, branch: "BCA" }), true);
  assert.equal(fullTimeReady({ year: 2, semester: 4, branch: "BCA" }), false);
  // A branch that names no degree keeps the old rule: 4th year, or 3rd in semester 6+.
  assert.equal(fullTimeReady({ year: 3, semester: 6, branch: "Design" }), true);
  assert.equal(fullTimeReady({ year: 3, semester: 5, branch: "Design" }), false);
  const drive = { collegeId: "c", kind: "full_time", eligibility: {}, includeUserIds: ["u2"], excludeUserIds: [] };
  const s = { userId: "u2", collegeId: "c", status: "verified" as const, leftAt: null, year: 2, branch: "BCA", cgpa: null, score: 7, semester: 4 };
  assert.equal(isStudentEligible(s, drive), false, "a hand-include does not open the full-time track to a 2nd year");
});

test("TC-D1: the ending-soon notice shows in the last 3 days, from server time", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  const two = driveCountdown(new Date(now.getTime() + 2 * 86_400_000), now);
  assert.deepEqual(two, { daysRemaining: 2, showExpiryWarning: true, ended: false });
  const six = driveCountdown(new Date(now.getTime() + 6 * 86_400_000), now);
  assert.deepEqual(six, { daysRemaining: 6, showExpiryWarning: false, ended: false });
  const past = driveCountdown(new Date(now.getTime() - 60_000), now);
  assert.deepEqual(past, { daysRemaining: 0, showExpiryWarning: false, ended: true });
  assert.equal(discountedMonthlyMinor(1_680_000, 15), 1_428_000);
});

test("another college's name reaches a drive company as initials only, at a fixed length", async () => {
  const { redactCollegeName } = await import("./labels.ts");
  assert.equal(redactCollegeName("Jaipur Knowledge Park"), "J••• K••• P•••");
  assert.equal(redactCollegeName("  IIT  (Delhi) "), "I••• D•••");
  assert.equal(redactCollegeName("A"), "A•••");
  assert.equal(redactCollegeName(""), "•••");
  assert.doesNotMatch(redactCollegeName("Jaipur Knowledge Park"), /aipur|nowledge|ark/);
});
