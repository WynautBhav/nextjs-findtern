import assert from "node:assert/strict";
import { test } from "node:test";

import { PRICING_PLANS } from "./content/home.ts";
import { inrMinorToUsdMinor } from "./currency.ts";
import { hireFeeMinor, lineCharge, LEGACY_PER_HIRE_MINOR } from "./checkout.ts";
import { resolvePricing } from "./employer-pricing.ts";
import { feeDisplay } from "./fee-display.ts";
import { buildOffer, carryPricingSnapshot, internStipendInrMinor, parseOffer, scheduledMonthlyHours } from "./offer.ts";
import { PER_HIRE_FEE_DEFAULT, type PerHireFeeSetting } from "./per-hire-fee.ts";
import { perHireFreeForNow, planMonthMinor } from "./plan-offer.ts";
import { PRICING_DEFAULTS, feeSettingOf, parsePricingConfig, stipendInrMinorFor, type BandId, type PlanRowLike } from "./pricing-config.ts";

/**
 * One edit, every surface: the admin changes the figures once and the calculator, the plan card, the
 * JSON-LD price, the fee line and the offer's stipend must all equal what checkout charges.
 * Pure code only: the DB reads (getPricingConfig, getPlans) are not run here; their rows are built by hand.
 */

const SLUG: Record<BandId, string> = { standard: "espresso", skilled: "cappuccino", assured: "latte" };
const SCORE: Record<BandId, number> = { standard: 4, skilled: 7, assured: 9 };

type Edit = { name: string; hourly: Record<BandId, number>; fee: Record<BandId, number>; stipend: { skilled: number; assured: number } };
const EDITS: Edit[] = [
  // The brief's edit: hourly 12300, fee 650000, stipend 900000 on every band.
  { name: "uniform edit", hourly: { standard: 12300, skilled: 12300, assured: 12300 }, fee: { standard: 650000, skilled: 650000, assured: 650000 }, stipend: { skilled: 900000, assured: 900000 } },
  // Distinct per band, so a band mixed up with its neighbour cannot pass.
  { name: "per-band edit", hourly: { standard: 7700, skilled: 12300, assured: 31500 }, fee: { standard: 610000, skilled: 650000, assured: 720000 }, stipend: { skilled: 900000, assured: 1_700_000 } },
];

const rows = (e: Edit): PlanRowLike[] =>
  (["standard", "skilled", "assured"] as const).map((id) => ({ slug: SLUG[id], currency: "INR", isActive: true, region: null, priceHourlyMinor: e.hourly[id], perHireChargeMinor: e.fee[id] }));
const configOf = (e: Edit, feeSetting: PerHireFeeSetting) =>
  parsePricingConfig({ plans: rows(e), feeSetting, stipendBands: { standard: null, ...e.stipend } });
const cardOf = (row: PlanRowLike, currency: "INR" | "USD") => ({
  slug: row.slug,
  priceHourlyMinor: currency === "USD" ? inrMinorToUsdMinor(row.priceHourlyMinor) : row.priceHourlyMinor,
  perHireChargeMinor: currency === "USD" ? inrMinorToUsdMinor(row.perHireChargeMinor) : row.perHireChargeMinor,
});

const sendOffer = (score: number, currency: "INR" | "USD", plans: PlanRowLike[], feeSetting: PerHireFeeSetting, config = parsePricingConfig({ plans, feeSetting })) => {
  const pricing = resolvePricing(score, plans as never, currency, null, feeSetting, config);
  const raw = buildOffer({
    currency,
    roleTitle: "Designer",
    mode: "remote",
    startDate: "2026-12-01",
    duration: "1m",
    monthlyHours: scheduledMonthlyHours("mon_fri", 0),
    hourlyRateMinor: pricing.hourlyRateMinor,
    perHireMinor: pricing.perHireMinor,
    perHireListMinor: pricing.perHireListMinor,
    pricing: config,
    candidateScore: score,
  });
  return { pricing, raw, offer: parseOffer(raw, currency) };
};

for (const edit of EDITS) {
  for (const band of ["standard", "skilled", "assured"] as const) {
    for (const currency of ["INR", "USD"] as const) {
      for (const feeOn of [true, false]) {
        test(`parity (${edit.name}): ${band} ${currency} fee ${feeOn ? "on" : "off"}`, () => {
          // This band's switch as asked; the others opposite, so a band read from the wrong switch fails.
          const feeSetting = { standard: !feeOn, skilled: !feeOn, assured: !feeOn, [band]: feeOn } as PerHireFeeSetting;
          const plans = rows(edit);
          const config = configOf(edit, feeSetting);
          const score = SCORE[band];
          const { pricing, offer } = sendOffer(score, currency, plans, feeSetting, config);
          const charge = lineCharge(offer, score, "postpaid", { feeSetting });

          const row = plans.find((p) => p.slug === SLUG[band])!;
          const card = cardOf(row, currency);

          // The rate and the fee the employer is quoted are the edited ones.
          assert.equal(pricing.hourlyRateMinor, card.priceHourlyMinor);
          assert.equal(pricing.perHireListMinor, card.perHireChargeMinor);
          assert.equal(charge.perHireMinor, feeOn ? card.perHireChargeMinor : 0);

          // Calculator month and first month, from the plan card.
          const calc = planMonthMinor({ hourlyMinor: card.priceHourlyMinor, perHireMinor: card.perHireChargeMinor, perHireFree: perHireFreeForNow(card.slug, feeSetting), schedule: "mon_fri" });
          assert.equal(calc.monthlyMinor, offer.monthlyMinor);
          assert.equal(calc.firstMonthMinor, charge.totalMinor);

          // Plan-card fee (what the page shows when charged) and the JSON-LD price (0 when free).
          assert.equal(perHireFreeForNow(card.slug, feeSetting) ? 0 : card.perHireChargeMinor, charge.perHireMinor);

          // The fee line on an offer.
          const shown = feeDisplay({ currency, chargedMinor: charge.perHireMinor, listMinor: hireFeeMinor(offer) });
          if (feeOn) assert.deepEqual(shown, { kind: "charged", amountMinor: charge.totalMinor - (offer.monthlyMinor ?? 0) });
          else assert.deepEqual(shown, { kind: "free", listMinor: card.perHireChargeMinor });

          // The stipend written on the offer is the edited one, in INR whatever the employer's currency.
          assert.equal(internStipendInrMinor(offer, score), stipendInrMinorFor(config, score) ?? 0);
          assert.equal(internStipendInrMinor(offer, score), band === "standard" ? 0 : edit.stipend[band]);
        });
      }
    }
  }
}

/* ── No edit: every number is today's number ───────────────────────── */

test("defaults: no admin edit gives exactly the figures published before pricing was editable", () => {
  const seedRows = PRICING_PLANS as unknown as PlanRowLike[];
  const golden = {
    inr: { standard: [0, 500000, 500000], skilled: [10000, 0, 500000], assured: [20000, 0, 500000] },
    usd: { standard: [0, 5000, 5000], skilled: [100, 0, 5000], assured: [200, 0, 5000] },
  } as const;
  for (const currency of ["INR", "USD"] as const) {
    for (const band of ["standard", "skilled", "assured"] as const) {
      const p = resolvePricing(SCORE[band], seedRows as never, currency, null, PER_HIRE_FEE_DEFAULT);
      assert.deepEqual([p.hourlyRateMinor, p.perHireMinor, p.perHireListMinor], golden[currency === "INR" ? "inr" : "usd"][band], `${band} ${currency} from the seeded rate card`);
      // No rows at all: the config defaults give the same answer.
      const q = resolvePricing(SCORE[band], [], currency, null, PER_HIRE_FEE_DEFAULT);
      assert.deepEqual([q.hourlyRateMinor, q.perHireMinor, q.perHireListMinor], golden[currency === "INR" ? "inr" : "usd"][band], `${band} ${currency} with no rows`);
    }
  }
  assert.deepEqual(feeSettingOf(PRICING_DEFAULTS), PER_HIRE_FEE_DEFAULT);
  assert.deepEqual(parsePricingConfig({ plans: seedRows, feeSetting: PER_HIRE_FEE_DEFAULT }), PRICING_DEFAULTS);
  assert.deepEqual([stipendInrMinorFor(PRICING_DEFAULTS, 5.9), stipendInrMinorFor(PRICING_DEFAULTS, 6), stipendInrMinorFor(PRICING_DEFAULTS, 7.99), stipendInrMinorFor(PRICING_DEFAULTS, 8)], [null, 800000, 800000, 1500000]);
  assert.equal(PRICING_DEFAULTS.activationFeeInrMinor, 249900);
});

test("defaults: a sent offer's stored figures and what checkout charges are unchanged", () => {
  // Cappuccino 7.0, 1 month: ₹17,600, stipend ₹8,000, fee free now (₹5,000 listed).
  const cap = sendOffer(7, "INR", [], PER_HIRE_FEE_DEFAULT);
  assert.equal(cap.raw.monthlyAmount, 17600);
  assert.equal(cap.raw.internStipendMonthly, 8000);
  assert.equal(cap.raw.perHireCharge, 0);
  assert.equal(cap.raw.perHireListCharge, 5000);
  assert.equal(lineCharge(cap.offer, 7, "postpaid", { feeSetting: PER_HIRE_FEE_DEFAULT }).totalMinor, 1_760_000);
  // Latte 9.0: ₹35,200, stipend ₹15,000.
  const latte = sendOffer(9, "INR", [], PER_HIRE_FEE_DEFAULT);
  assert.equal(latte.raw.monthlyAmount, 35200);
  assert.equal(latte.raw.internStipendMonthly, 15000);
  // Espresso 4.0: no monthly amount, the ₹5,000 fee, stipend 0. USD: $50.
  const esp = sendOffer(4, "INR", [], PER_HIRE_FEE_DEFAULT);
  assert.equal(esp.raw.internStipendMonthly, 0);
  assert.equal(lineCharge(esp.offer, 4, "postpaid", { feeSetting: PER_HIRE_FEE_DEFAULT }).totalMinor, 500_000);
  const espUsd = sendOffer(4, "USD", [], PER_HIRE_FEE_DEFAULT);
  assert.equal(lineCharge(espUsd.offer, 4, "postpaid", { feeSetting: PER_HIRE_FEE_DEFAULT }).totalMinor, 5_000);
});

/* ── Snapshots: nothing sent or paid is repriced ───────────────────── */

const ON: PerHireFeeSetting = { standard: true, skilled: true, assured: true };
const OFF: PerHireFeeSetting = { standard: false, skilled: false, assured: false };

test("snapshot: an offer from before the snapshot existed still charges ₹5,000 / $50", () => {
  // No perHireListCharge, the fee stored as 0 (sent while free) or not at all (legacy).
  for (const stored of [{ perHireCharge: 0 }, {}]) {
    const inr = parseOffer({ monthlyAmount: 17600, duration: "1m", candidateScore: 7, totalPrice: 17600, ...stored }, "INR");
    const usd = parseOffer({ monthlyAmount: 176, duration: "1m", candidateScore: 7, totalPrice: 176, ...stored }, "USD");
    assert.equal(inr.perHireListMinor, null);
    assert.equal(hireFeeMinor(inr, { feeSetting: ON }), LEGACY_PER_HIRE_MINOR.INR);
    assert.equal(hireFeeMinor(usd, { feeSetting: ON }), LEGACY_PER_HIRE_MINOR.USD);
    assert.equal(hireFeeMinor(inr, { feeSetting: ON }), 500_000);
    assert.equal(hireFeeMinor(usd, { feeSetting: ON }), 5_000);
    assert.equal(lineCharge(inr, 7, "postpaid", { feeSetting: ON }).totalMinor, 1_760_000 + 500_000);
    assert.equal(lineCharge(inr, 7, "postpaid", { feeSetting: OFF }).totalMinor, 1_760_000);
  }
});

test("snapshot: an offer sent free is charged the fee it was priced with when the band is switched on, not a later rate", () => {
  const edit = EDITS[0];
  const sent = sendOffer(7, "INR", rows(edit), OFF, configOf(edit, OFF));
  assert.equal(sent.raw.perHireCharge, 0);
  assert.equal(sent.raw.perHireListCharge, 6500);
  // The admin then raises the fee to ₹9,000 and turns the band on: this offer keeps ₹6,500.
  const later = { ...edit, fee: { standard: 900000, skilled: 900000, assured: 900000 } };
  const laterPricing = resolvePricing(7, rows(later) as never, "INR", null, ON, configOf(later, ON));
  assert.equal(laterPricing.perHireMinor, 900000);
  assert.equal(hireFeeMinor(sent.offer, { feeSetting: ON }), 650000);
  assert.equal(lineCharge(sent.offer, 7, "postpaid", { feeSetting: ON }).totalMinor, sent.offer.monthlyMinor! + 650000);
});

test("snapshot: editing the config after send does not reprice a sent offer's rate, fee or stipend", () => {
  const before = sendOffer(7, "INR", rows(EDITS[0]), ON, configOf(EDITS[0], ON));
  const monthly = before.offer.monthlyMinor;
  const stored = JSON.parse(JSON.stringify(before.raw));
  // Config changes under it; the stored offer is re-read and charged.
  void configOf(EDITS[1], ON);
  const reread = parseOffer(stored, "INR");
  assert.equal(reread.monthlyMinor, monthly);
  assert.equal(lineCharge(reread, 7, "postpaid", { feeSetting: ON }).totalMinor, monthly! + 650000);
  assert.equal(internStipendInrMinor(reread, 7), 900000);
});

test("snapshot: a paid order keeps the fee it recorded, whatever the setting or snapshot says", () => {
  const sent = sendOffer(7, "INR", rows(EDITS[0]), ON);
  for (const setting of [ON, OFF]) {
    assert.equal(hireFeeMinor(sent.offer, { feeSetting: setting, feeMinor: 500_000 }), 500_000);
    assert.equal(hireFeeMinor(sent.offer, { feeSetting: setting, feeMinor: 0 }), 0);
    assert.equal(lineCharge(sent.offer, 7, "postpaid", { feeSetting: setting, feeMinor: 500_000 }).perHireMinor, 500_000);
  }
});

test("snapshot: an edit of the offer's terms carries the stipend and both fee figures over unchanged", () => {
  const sent = sendOffer(7, "INR", rows(EDITS[0]), OFF, configOf(EDITS[0], OFF));
  const edited = carryPricingSnapshot(sent.raw, { ...sent.raw, internStipendMonthly: 1, perHireCharge: 1, perHireListCharge: 1, duration: "2m" });
  assert.equal(edited.internStipendMonthly, 9000);
  assert.equal(edited.perHireCharge, 0);
  assert.equal(edited.perHireListCharge, 6500);
  // An older offer has no snapshot and does not gain one from an edit.
  const old = { monthlyAmount: 17600, duration: "1m" };
  assert.deepEqual(Object.keys(carryPricingSnapshot(old, { ...old, duration: "2m" })).sort(), ["duration", "monthlyAmount"]);
  // The three keys exist on a new offer, so the edit route's carry has something to carry.
  assert.ok(["internStipendMonthly", "perHireCharge", "perHireListCharge"].every((k) => k in sent.raw));
});
