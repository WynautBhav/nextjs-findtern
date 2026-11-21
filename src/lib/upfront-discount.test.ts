import { test } from "node:test";
import assert from "node:assert/strict";

import { lineCharge } from "./checkout.ts";
import { parseOffer } from "./offer.ts";
import {
  UPFRONT_DISCOUNT_DEFAULT,
  parseUpfrontDiscount,
  recordedUpfrontDiscountOf,
  upfrontDiscountBodySchema,
  upfrontDiscountMinor,
} from "./upfront-discount.ts";

const rule = UPFRONT_DISCOUNT_DEFAULT;

test("the default rule: 10% off for 3 months or more, on", () => {
  assert.deepEqual(rule, { enabled: true, percent: 10, minMonths: 3 });
});

test("10% off the monthly charges at 3+ months, nothing below 3 months or when switched off", () => {
  assert.equal(upfrontDiscountMinor(4_800_000, 3, rule), 480_000);
  assert.equal(upfrontDiscountMinor(9_600_000, 6, rule), 960_000);
  assert.equal(upfrontDiscountMinor(3_200_000, 2, rule), 0);
  assert.equal(upfrontDiscountMinor(4_800_000, 3, { ...rule, enabled: false }), 0);
  assert.equal(upfrontDiscountMinor(4_800_000, 3, null), 0);
  assert.equal(upfrontDiscountMinor(0, 3, rule), 0);
  // Rounds to a whole minor unit.
  assert.equal(upfrontDiscountMinor(333, 3, rule), 33);
});

test("a stored rule is read field by field; garbage falls back to the default", () => {
  assert.deepEqual(parseUpfrontDiscount(null), rule);
  assert.deepEqual(parseUpfrontDiscount("not json"), rule);
  assert.deepEqual(parseUpfrontDiscount({ enabled: false, percent: 15, minMonths: 4 }), { enabled: false, percent: 15, minMonths: 4 });
  assert.deepEqual(parseUpfrontDiscount({ percent: 0, minMonths: 99 }), rule);
  assert.deepEqual(parseUpfrontDiscount(JSON.stringify({ percent: 12 })), { ...rule, percent: 12 });
});

test("the admin body is strict and bounded", () => {
  assert.equal(upfrontDiscountBodySchema.safeParse({ upfrontDiscount: { enabled: true, percent: 10, minMonths: 3 } }).success, true);
  assert.equal(upfrontDiscountBodySchema.safeParse({ upfrontDiscount: { enabled: true, percent: 0, minMonths: 3 } }).success, false);
  assert.equal(upfrontDiscountBodySchema.safeParse({ upfrontDiscount: { enabled: true, percent: 51, minMonths: 3 } }).success, false);
  assert.equal(upfrontDiscountBodySchema.safeParse({ upfrontDiscount: { enabled: true, percent: 10.5, minMonths: 3 } }).success, false);
  assert.equal(upfrontDiscountBodySchema.safeParse({ upfrontDiscount: { enabled: true, percent: 10 } }).success, false);
  assert.equal(upfrontDiscountBodySchema.safeParse({ upfrontDiscount: { enabled: true, percent: 10, minMonths: 3, extra: 1 } }).success, false);
});

const offer = (months: number, monthly: number, fee: number, currency: "INR" | "USD" = "INR") =>
  parseOffer({ duration: `${months}m`, monthlyAmount: monthly / 100, perHireMinor: fee, totalPrice: (monthly * months + fee) / 100 }, currency);

test("upfront at 3 months: 10% off the monthly charges, the hiring fee paid in full", () => {
  const o = offer(3, 1_600_000, 500_000);
  const c = lineCharge(o, 7, "upfront", { upfrontDiscount: rule });
  assert.equal(c.perHireMinor, 500_000);
  assert.equal(c.baseMinor, 4_800_000 + 500_000);
  assert.equal(c.discountMinor, 480_000);
  assert.equal(c.totalMinor, 4_800_000 - 480_000 + 500_000);
});

test("USD gets the same rule", () => {
  const c = lineCharge(offer(4, 16_000, 5_000, "USD"), 7, "upfront", { upfrontDiscount: rule });
  assert.equal(c.discountMinor, 6_400);
  assert.equal(c.totalMinor, 64_000 - 6_400 + 5_000);
});

test("no discount under 3 months, on post-paid or monthly, or without the rule", () => {
  assert.equal(lineCharge(offer(2, 1_600_000, 500_000), 7, "upfront", { upfrontDiscount: rule }).discountMinor, 0);
  assert.equal(lineCharge(offer(3, 1_600_000, 500_000), 7, "postpaid", { upfrontDiscount: rule }).discountMinor, 0);
  assert.equal(lineCharge(offer(3, 1_600_000, 500_000), 7, "monthly", { upfrontDiscount: rule }).discountMinor, 0);
  assert.equal(lineCharge(offer(3, 1_600_000, 500_000), 7, "upfront").discountMinor, 0);
});

test("a full-time offer never gets it", () => {
  const ft = parseOffer({ fullTimeOffer: { annualCtc: 600000 } }, "INR");
  if (ft.fullTime) assert.equal(lineCharge(ft, 7, "upfront", { upfrontDiscount: rule }).discountMinor, 0);
});

test("the discount an order recorded is read per hire", () => {
  assert.equal(recordedUpfrontDiscountOf({ notes: { upfrontDiscountMinor: { p1: 480000 } } }, "p1"), 480000);
  assert.equal(recordedUpfrontDiscountOf({ order: { notes: { upfrontDiscountMinor: { p1: 100 } } } }, "p1"), 100);
  assert.equal(recordedUpfrontDiscountOf({ notes: { upfrontDiscountMinor: { p1: 480000 } } }, "p2"), 0);
  assert.equal(recordedUpfrontDiscountOf(null, "p1"), 0);
});

test("the editor's draft validates the same bounds as the API", async () => {
  const { validateUpfrontDraft } = await import("./upfront-discount.ts");
  assert.deepEqual(validateUpfrontDraft({ enabled: true, percent: "10", minMonths: "3" }), { ok: true, rule: { enabled: true, percent: 10, minMonths: 3 } });
  assert.equal(validateUpfrontDraft({ enabled: true, percent: "0", minMonths: "3" }).ok, false);
  assert.equal(validateUpfrontDraft({ enabled: true, percent: "10.5", minMonths: "3" }).ok, false);
  assert.equal(validateUpfrontDraft({ enabled: true, percent: "10", minMonths: "13" }).ok, false);
  assert.equal(validateUpfrontDraft({ enabled: false, percent: "", minMonths: "3" }).ok, false);
});

test("an upfront-paid hire with a recorded discount is fully paid at the discounted cost; the invoice names the discount", async () => {
  const { placementLedger } = await import("./dues.ts");
  const { hireInvoiceLines } = await import("./invoice-lines.ts");
  const offerDetails = { duration: "3m", monthlyAmount: 16000, totalPrice: 53000, startDate: "2026-12-01" };
  const hire = { id: "p1", status: "hired", offerDetails, currency: "INR", hiredAt: "2026-11-20T00:00:00Z" };
  const paid = {
    status: "paid",
    paidAt: "2026-11-20T00:00:00Z",
    amountMinor: 4_820_000,
    raw: { notes: { proposalIds: ["p1"], paymentMode: "total", perHireFeeMinor: { p1: 500_000 }, upfrontDiscountMinor: { p1: 480_000 } } },
  };
  const l = placementLedger(hire, [paid]);
  assert.deepEqual([l.plan, l.status, l.totalMinor, l.paidMinor, l.dueMinor], ["upfront", "fully_paid", 4_820_000, 4_820_000, 0]);

  const lines = hireInvoiceLines({ who: "Asha K", roleTitle: "Designer", projectName: "Brand", offer: parseOffer(offerDetails, "INR"), monthly: false, paymentIndex: 0, chargedMinor: 4_820_000, feeMinor: 500_000, upfrontDiscountMinor: 480_000 });
  assert.deepEqual(lines.map((x) => x.amountMinor), [4_320_000, 500_000]);
  assert.match(lines[0].detail ?? "", /after an upfront discount of ₹4,800/);
});
