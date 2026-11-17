import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRICING_DEFAULTS,
  bandMoney,
  parsePricingConfig,
  parseStipendBands,
  planForBand,
  stipendInrMinorFor,
  toUsd,
  validatePricingConfig,
  type PlanRowLike,
} from "./pricing-config.ts";

const row = (slug: string, hourly: number, fee: number, over: Partial<PlanRowLike> = {}): PlanRowLike => ({
  slug,
  currency: "INR",
  isActive: true,
  region: null,
  priceHourlyMinor: hourly,
  perHireChargeMinor: fee,
  ...over,
});

test("nothing stored: the config is today's published card", () => {
  assert.deepEqual(parsePricingConfig(), PRICING_DEFAULTS);
  assert.deepEqual(parsePricingConfig({ plans: [], feeSetting: null, stipendBands: undefined, activationFeeMinor: undefined }), PRICING_DEFAULTS);
  assert.deepEqual(
    PRICING_DEFAULTS.bands.map((b) => [b.hourlyInrMinor, b.hireFeeInrMinor, b.hireFeeCharged, b.stipendInrMinor]),
    [[0, 500000, true, null], [10000, 500000, false, 800000], [20000, 500000, false, 1500000]],
  );
  assert.equal(PRICING_DEFAULTS.activationFeeInrMinor, 249900);
  assert.equal(PRICING_DEFAULTS.inrPerUsd, 100);
});

test("plan rows, the switch, the stipend and the activation fee each override their own field", () => {
  const c = parsePricingConfig({
    plans: [row("espresso", 5000, 600000), row("cappuccino", 12300, 650000), row("latte", 25000, 700000)],
    feeSetting: { standard: false, skilled: true, assured: true },
    stipendBands: { standard: null, skilled: 900000, assured: 1600000 },
    activationFeeMinor: 299900,
  });
  assert.deepEqual(c.bands.map((b) => b.hourlyInrMinor), [5000, 12300, 25000]);
  assert.deepEqual(c.bands.map((b) => b.hireFeeInrMinor), [600000, 650000, 700000]);
  assert.deepEqual(c.bands.map((b) => b.hireFeeCharged), [false, true, true]);
  assert.deepEqual(c.bands.map((b) => b.stipendInrMinor), [null, 900000, 1600000]);
  assert.equal(c.activationFeeInrMinor, 299900);
});

test("garbage falls back field by field, and a stored 0 fee keeps the default fee", () => {
  const c = parsePricingConfig({
    plans: [row("cappuccino", -5, 0), row("espresso", 1.5, 100)],
    stipendBands: { skilled: "lots", assured: 1_700_000, standard: 999 },
    activationFeeMinor: "NaN",
  });
  assert.equal(c.bands[1].hourlyInrMinor, 10000);
  assert.equal(c.bands[1].hireFeeInrMinor, 500000);
  assert.equal(c.bands[0].hourlyInrMinor, 0);
  assert.equal(c.bands[0].hireFeeInrMinor, 100);
  assert.deepEqual(c.bands.map((b) => b.stipendInrMinor), [null, 800000, 1_700_000]);
  assert.equal(c.activationFeeInrMinor, 249900);
  assert.deepEqual(parseStipendBands("{not json"), parseStipendBands(null));
});

test("USD rows and inactive rows are ignored; India-scoped rows win; a slug names the band", () => {
  const plans = [row("latte", 99, 99, { currency: "USD" }), row("latte", 1, 1, { isActive: false }), row("latte-global", 20100, 510000), row("latte-in", 20200, 520000, { region: "IN" })];
  assert.equal(planForBand(plans, "assured")?.slug, "latte-in");
  // One India-scoped row left and no slug for Cappuccino: nothing to index into, so the default applies.
  assert.equal(planForBand(plans, "skilled"), undefined);
});

test("a score picks its band at the fixed cut-offs 6 and 8; USD is derived at 100 to 1", () => {
  const c = parsePricingConfig({ plans: [row("espresso", 0, 650000), row("cappuccino", 12300, 650000), row("latte", 12300, 650000)] });
  assert.equal(bandMoney(c, 5.99).id, "standard");
  assert.equal(bandMoney(c, 6).id, "skilled");
  assert.equal(bandMoney(c, 8).id, "assured");
  assert.deepEqual(
    [bandMoney(c, 7, "USD").hourlyMinor, bandMoney(c, 7, "USD").hireFeeListMinor, bandMoney(c, 7, "USD").hireFeeMinor],
    [123, 6500, 0],
  );
  assert.equal(toUsd(c).length, 3);
  assert.equal(stipendInrMinorFor(c, 5.9), null);
  assert.equal(stipendInrMinorFor(c, 6), 800000);
  assert.equal(stipendInrMinorFor(c, 9), 1500000);
});

test("validation: whole minor units, fee above 0, activation above 0, fixed ranges", () => {
  assert.deepEqual(validatePricingConfig(PRICING_DEFAULTS), []);
  const edit = (f: (c: typeof PRICING_DEFAULTS) => void) => {
    const c = structuredClone(PRICING_DEFAULTS);
    f(c);
    return validatePricingConfig(c).map((i) => i.path);
  };
  assert.deepEqual(edit((c) => (c.bands[1].hireFeeInrMinor = 0)), ["bands.skilled.hireFeeInrMinor"]);
  assert.deepEqual(edit((c) => (c.bands[1].hourlyInrMinor = 1.5)), ["bands.skilled.hourlyInrMinor"]);
  assert.deepEqual(edit((c) => (c.bands[2].hourlyInrMinor = 100_000_001)), ["bands.assured.hourlyInrMinor"]);
  assert.deepEqual(edit((c) => (c.bands[2].stipendInrMinor = -1)), ["bands.assured.stipendInrMinor"]);
  assert.deepEqual(edit((c) => (c.bands[2].stipendInrMinor = null)), ["bands.assured.stipendInrMinor"]);
  assert.deepEqual(edit((c) => (c.bands[0].stipendInrMinor = 100)), ["bands.standard.stipendInrMinor"]);
  assert.deepEqual(edit((c) => (c.activationFeeInrMinor = 0)), ["activationFeeInrMinor"]);
  assert.deepEqual(edit((c) => (c.bands[1].minScore = 5)), ["bands.1"]);
  assert.deepEqual(edit((c) => (c.inrPerUsd = 80)), ["inrPerUsd"]);
});
