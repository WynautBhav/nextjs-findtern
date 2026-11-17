import assert from "node:assert/strict";
import { test } from "node:test";

import { PRICING_DEFAULTS } from "../pricing-config.ts";
import { isStipendBody, pricingConfigAuditMeta, stipendAuditMeta, stipendBodySchema } from "./pricing-config-setting.ts";

const ok = { internStipendBands: { standard: null, skilled: 900000, assured: 1500000 } };

test("a full three-band stipend body is accepted", () => {
  const r = stipendBodySchema.safeParse(ok);
  assert.equal(r.success, true);
});

test("missing band, extra key, negative, fractional, huge, Espresso stipend and empty bodies are refused", () => {
  const b = ok.internStipendBands;
  const bad: unknown[] = [
    { internStipendBands: { standard: null, skilled: 1 } },
    { internStipendBands: { ...b, platinum: 1 } },
    { internStipendBands: { ...b, skilled: -1 } },
    { internStipendBands: { ...b, skilled: 1.5 } },
    { internStipendBands: { ...b, assured: 100_000_001 } },
    { internStipendBands: { ...b, assured: "9" } },
    { internStipendBands: { ...b, standard: 100 } },
    { internStipendBands: null },
    { internStipendBands: b, extra: 1 },
    {},
    null,
  ];
  for (const body of bad) assert.equal(stipendBodySchema.safeParse(body).success, false, JSON.stringify(body));
  assert.equal(isStipendBody(ok), true);
  assert.equal(isStipendBody({ perHireFeeBands: {} }), false);
});

test("audit meta lists what moved, with both values", () => {
  const from = { standard: null, skilled: 800000, assured: 1500000 };
  assert.deepEqual(stipendAuditMeta(from, { ...from, assured: 1600000 }), { value: { from, to: { ...from, assured: 1600000 } }, changed: ["Latte"] });
  const to = structuredClone(PRICING_DEFAULTS);
  to.bands[1].hourlyInrMinor = 12300;
  to.activationFeeInrMinor = 300000;
  assert.deepEqual(pricingConfigAuditMeta(PRICING_DEFAULTS, to), {
    changes: { "skilled.hourlyInrMinor": { from: 10000, to: 12300 }, activationFeeInrMinor: { from: 249900, to: 300000 } },
    changed: ["skilled.hourlyInrMinor", "activationFeeInrMinor"],
  });
  assert.deepEqual(pricingConfigAuditMeta(PRICING_DEFAULTS, PRICING_DEFAULTS).changed, []);
});
