import assert from "node:assert/strict";
import { test } from "node:test";

import { orderRecordedFee, recordedFeeOf } from "./billing-plan.ts";
import { hireFeeMinor, lineCharge, PER_HIRE_MINOR } from "./checkout.ts";
import { resolvePricing } from "./employer-pricing.ts";
import { buildOffer, parseOffer } from "./offer.ts";
import { PER_HIRE_FEE_DEFAULT } from "./per-hire-fee.ts";
import { perHireFreeForNow } from "./plan-offer.ts";

const ALL_ON = { standard: true, skilled: true, assured: true };
const ALL_OFF = { standard: false, skilled: false, assured: false };

/** An offer priced on a score; `fee` is what was stored on it when sent (the band's amount, or 0 when it was free). */
const offerAt = (score: number, fee: number) =>
  parseOffer(
    buildOffer({ currency: "INR", roleTitle: "Dev", mode: "remote", startDate: "2026-11-02", duration: "3m", monthlyHours: 160, hourlyRateMinor: 10_000, perHireMinor: fee, candidateScore: score }),
    "INR",
  );

test("default setting: a 7 (Cappuccino) offer sent with the fee pays none now; a score under 6 still pays it", () => {
  const cappuccino = offerAt(7, 500_000); // sent while the band was charged: total carries the fee
  const c = lineCharge(cappuccino, 7, "upfront", { feeSetting: PER_HIRE_FEE_DEFAULT });
  assert.equal(c.perHireMinor, 0);
  assert.equal(c.totalMinor, 1_600_000 * 3, "engagement only: the stored fee comes out of the stored total");
  const espresso = offerAt(4, 500_000);
  const e = lineCharge(espresso, 4, "upfront", { feeSetting: PER_HIRE_FEE_DEFAULT });
  assert.equal(e.perHireMinor, 500_000);
  assert.equal(e.totalMinor, 1_600_000 * 3 + 500_000);
});

test("an admin switch reprices offers not yet paid, both ways", () => {
  const sentFree = offerAt(9, 0); // sent while Latte was free
  assert.equal(lineCharge(sentFree, 9, "upfront", { feeSetting: PER_HIRE_FEE_DEFAULT }).perHireMinor, 0);
  const on = lineCharge(sentFree, 9, "upfront", { feeSetting: ALL_ON });
  assert.equal(on.perHireMinor, PER_HIRE_MINOR.INR, "Latte switched on charges the standard fee");
  assert.equal(on.totalMinor, 1_600_000 * 3 + PER_HIRE_MINOR.INR);
  const sentCharged = offerAt(9, 500_000);
  const off = lineCharge(sentCharged, 9, "upfront", { feeSetting: ALL_OFF });
  assert.equal(off.perHireMinor, 0);
  assert.equal(off.totalMinor, 1_600_000 * 3);
  assert.ok(off.totalMinor > 0 && off.baseMinor === off.totalMinor);
});

test("first payment only: later months never carry the fee, charged band or not", () => {
  const o = offerAt(4, 500_000);
  for (const setting of [PER_HIRE_FEE_DEFAULT, ALL_ON, ALL_OFF]) {
    assert.equal(lineCharge(o, 4, "monthly", { feeSetting: setting, firstPayment: false }).perHireMinor, 0);
  }
  const high = offerAt(8, 500_000);
  const first = lineCharge(high, 8, "postpaid", { feeSetting: ALL_ON });
  const free = lineCharge(high, 8, "postpaid", { feeSetting: PER_HIRE_FEE_DEFAULT });
  assert.equal(first.totalMinor - free.totalMinor, 500_000);
  assert.equal(lineCharge(high, 8, "postpaid", { feeSetting: ALL_ON, firstPayment: false }).totalMinor, free.totalMinor);
});

test("promo: only the fee that is actually charged is undiscountable (order route sums charge.perHireMinor)", () => {
  const lines = [offerAt(7, 500_000), offerAt(4, 500_000)].map((o, i) => lineCharge(o, [7, 4][i], "upfront", { feeSetting: PER_HIRE_FEE_DEFAULT }));
  assert.equal(lines.reduce((s, l) => s + l.perHireMinor, 0), 500_000);
  const allFree = [offerAt(7, 500_000), offerAt(4, 500_000)].map((o, i) => lineCharge(o, [7, 4][i], "upfront", { feeSetting: ALL_OFF }));
  assert.equal(allFree.reduce((s, l) => s + l.perHireMinor, 0), 0);
});

test("a paid hire keeps the fee its order recorded, whatever the setting is now", () => {
  const o = offerAt(7, 500_000);
  assert.equal(lineCharge(o, 7, "upfront", { feeMinor: 500_000, feeSetting: ALL_OFF }).perHireMinor, 500_000);
  assert.equal(lineCharge(o, 7, "upfront", { feeMinor: 0, feeSetting: ALL_ON }).perHireMinor, 0);
  assert.equal(hireFeeMinor(o, { feeMinor: 0 }), 0);
  // No recorded fee, no setting: the old behaviour (the offer's own fee).
  assert.equal(lineCharge(o, 7, "upfront").perHireMinor, 500_000);
});

test("orders record the fee per proposal, and ledgers read it back", () => {
  const raw = { notes: { proposalIds: ["p1"], perHireFeeMinor: { p1: 0 } } };
  assert.equal(orderRecordedFee(raw, "p1"), 0);
  assert.equal(orderRecordedFee(raw, "p2"), null);
  assert.equal(orderRecordedFee({ notes: { proposalIds: ["p1"] } }, "p1"), null);
  assert.equal(recordedFeeOf("p1", [{ status: "paid", raw }]), 0);
  assert.equal(recordedFeeOf("p1", [{ status: "created", raw }]), null);
});

const plan = (slug: string, hourly: number, perHire: number) =>
  ({ id: slug, slug, displayName: slug, region: "IN", currency: "INR", isActive: true, priceHourlyMinor: hourly, perHireChargeMinor: perHire }) as never;
const PLANS = [plan("espresso", 0, 500_000), plan("cappuccino", 10_000, 500_000), plan("latte", 20_000, 500_000)];

test("resolvePricing: an off band prices at 0 and the fallbacks never bring it back", () => {
  const cap = resolvePricing(7, PLANS, "INR", null, PER_HIRE_FEE_DEFAULT);
  assert.equal(cap.perHireMinor, 0);
  assert.equal(cap.perHireListMinor, 500_000);
  assert.equal(cap.perHireCharged, false);
  const esp = resolvePricing(3, PLANS, "INR", null, PER_HIRE_FEE_DEFAULT);
  assert.equal(esp.perHireMinor, 500_000);
  // No CMS rows at all: the BANDS fallback must honour the setting too.
  assert.equal(resolvePricing(9, [], "INR", null, PER_HIRE_FEE_DEFAULT).perHireMinor, 0);
  assert.equal(resolvePricing(9, [], "INR", null, ALL_ON).perHireMinor, 500_000);
  assert.equal(resolvePricing(9, [], "USD", null, ALL_ON).perHireMinor, 5_000);
  // A stored 0 with the band on falls back to the band amount (old behaviour kept for charged bands).
  assert.equal(resolvePricing(7, [plan("cappuccino", 10_000, 0)], "INR", null, ALL_ON).perHireMinor, 500_000);
  assert.equal(resolvePricing(7, [plan("cappuccino", 10_000, 0)], "INR", null, ALL_OFF).perHireMinor, 0);
});

test("the display flag and the billing decision cannot disagree: one setting", () => {
  for (const setting of [PER_HIRE_FEE_DEFAULT, ALL_ON, ALL_OFF, { standard: false, skilled: true, assured: true }]) {
    for (const [slug, score] of [["espresso", 3], ["cappuccino", 7], ["latte", 9]] as const) {
      const priced = resolvePricing(score, PLANS, "INR", null, setting);
      assert.equal(perHireFreeForNow(slug, setting), priced.perHireMinor === 0, `${slug} ${JSON.stringify(setting)}`);
      assert.equal(lineCharge(offerAt(score, 500_000), score, "upfront", { feeSetting: setting }).perHireMinor === 0, priced.perHireMinor === 0);
    }
  }
});

test("paid invoices and ledgers never move with the setting: they read the fee the order recorded", async () => {
  const { placementLedger } = await import("./dues.ts");
  const { hireInvoiceLines } = await import("./invoice-lines.ts");
  const offerDetails = buildOffer({ currency: "INR", roleTitle: "Dev", mode: "remote", startDate: "2026-11-02", duration: "3m", monthlyHours: 160, hourlyRateMinor: 10_000, perHireMinor: 500_000, candidateScore: 7 });
  const hire = { id: "p1", status: "hired", offerDetails, currency: "INR" };
  const paid = (notes: Record<string, unknown>) => [{ status: "paid", paidAt: "2026-11-01T06:00:00Z", raw: { notes: { proposalIds: ["p1"], paymentMode: "total", ...notes } } }];
  // Paid with the fee: still shows it with every band off now.
  const withFee = placementLedger(hire, paid({ perHireFeeMinor: { p1: 500_000 } }));
  assert.equal(withFee.feeMinor, 500_000);
  assert.equal(withFee.totalMinor, 1_600_000 * 3 + 500_000);
  // Paid free: no fee, total is the engagement only, even though the offer still stores 500000.
  const free = placementLedger(hire, paid({ perHireFeeMinor: { p1: 0 } }));
  assert.equal(free.feeMinor, 0);
  assert.equal(free.totalMinor, 1_600_000 * 3);
  // An order from before the setting recorded nothing: the offer's own fee, as it was charged then.
  assert.equal(placementLedger(hire, paid({})).feeMinor, 500_000);

  const offer = parseOffer(offerDetails, "INR");
  const lines = (feeMinor: number | null) => hireInvoiceLines({ who: "A", roleTitle: "Dev", projectName: "P", offer, monthly: false, paymentIndex: 0, feeMinor });
  const total = (feeMinor: number | null) => lines(feeMinor).reduce((s, l) => s + (l.amountMinor ?? 0), 0);
  assert.equal(total(500_000), 1_600_000 * 3 + 500_000);
  assert.equal(total(0), 1_600_000 * 3);
  assert.equal(total(null), 1_600_000 * 3 + 500_000);
  // Post-paid fee order for a free band prints no hiring-charge line.
  const fee = (feeMinor: number) => hireInvoiceLines({ who: "A", roleTitle: "Dev", projectName: "P", offer, monthly: false, paymentIndex: 0, postpaid: "fee", withMonth1: true, feeMinor });
  assert.equal(fee(0).some((l) => /Hiring charge/.test(l.label)), false);
  assert.equal(fee(500_000).some((l) => /Hiring charge/.test(l.label)), true);
});
