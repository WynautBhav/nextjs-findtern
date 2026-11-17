import assert from "node:assert/strict";
import { test } from "node:test";

import { brandContext, platformHelpContext, systemPrompt } from "./chatbot/knowledge-text.ts";
import { pricingFaq } from "./content/pricing-faq.ts";
import { doorPoints } from "./auth-doors.ts";
import { perHireEmployerPayAnswer } from "./per-hire-copy.ts";
import {
  activationFeeText,
  hireFeeText,
  llmsInternMoneyLines,
  monthlyText,
  perHireMetaClause,
  pricingMetaSentence,
  rateRangeText,
  rateText,
  stipendText,
  usdRateText,
} from "./pricing-copy.ts";
import { PRICING_DEFAULTS, feeSettingOf, parsePricingConfig, type PlanRowLike } from "./pricing-config.ts";
import { bandsForConfig } from "./score.ts";
import { planMonthMinor } from "./plan-offer.ts";

/**
 * The public price surfaces' text, from the pricing config. With no admin edit it must read exactly as the
 * figures that used to be typed into each file (the "default" tests quote those words); with the brief's edit
 * (hourly 12300, hiring fee 650000, stipend 900000) every one must follow. Pure code only: no DB, no render.
 */

const SLUG = { standard: "espresso", skilled: "cappuccino", assured: "latte" } as const;
const planRows = (hourly: number, fee: number): PlanRowLike[] =>
  (["standard", "skilled", "assured"] as const).map((id) => ({ slug: SLUG[id], currency: "INR", isActive: true, region: null, priceHourlyMinor: hourly, perHireChargeMinor: fee }));
const EDITED = parsePricingConfig({
  plans: planRows(12300, 650000),
  feeSetting: { standard: true, skilled: true, assured: true },
  stipendBands: { standard: null, skilled: 900000, assured: 900000 },
  activationFeeMinor: 349900,
});
const DEFAULT_FEE = feeSettingOf(PRICING_DEFAULTS);

test("default: the page-meta sentence, the fee and the rate range are the published words", () => {
  assert.equal(pricingMetaSentence(PRICING_DEFAULTS), "Three published plans from free to ₹200/hr, a ₹5,000 per-hire fee on Espresso (free for now on Cappuccino and Latte)");
  assert.equal(rateRangeText(PRICING_DEFAULTS, { capital: true }), "Free to ₹200/hr");
  assert.deepEqual(hireFeeText(PRICING_DEFAULTS), { inr: "₹5,000", usd: "$50" });
  assert.equal(activationFeeText(PRICING_DEFAULTS), "₹2,499");
  assert.equal(monthlyText(PRICING_DEFAULTS, "skilled"), "₹17,600");
  assert.equal(monthlyText(PRICING_DEFAULTS, "assured"), "₹35,200");
  assert.deepEqual([usdRateText(PRICING_DEFAULTS, "standard"), usdRateText(PRICING_DEFAULTS, "skilled"), usdRateText(PRICING_DEFAULTS, "assured")], ["$0", "$1/hr", "$2/hr"]);
  assert.deepEqual([stipendText(PRICING_DEFAULTS, "standard"), stipendText(PRICING_DEFAULTS, "skilled"), stipendText(PRICING_DEFAULTS, "assured")], [null, "₹8,000", "₹15,000"]);
});

test("default: the chatbot's prompt and the sign-in panel carry the published figures", () => {
  const brand = brandContext(DEFAULT_FEE, PRICING_DEFAULTS);
  assert.match(brand, /free profile → ₹2,499 one-time AI interview/);
  assert.match(brand, /Cappuccino ₹100\/hr \(score 6–8\) \/ Latte ₹200\/hr \(score 8\+\)\. The ₹5,000 per-hire charge applies on Espresso only; it is free for now on Cappuccino and Latte\. USD mirrors: \$0 \/ \$1\/hr \/ \$2\/hr plus the \$50 per-hire charge/);
  assert.match(systemPrompt(PRICING_DEFAULTS), /AI interview ₹2,499 one-time/);
  assert.match(systemPrompt(PRICING_DEFAULTS), /\(Espresso free\/hr, <6 score; Cappuccino ₹100\/hr, 6–8; Latte ₹200\/hr, 8\+\)/);
  assert.match(platformHelpContext(PRICING_DEFAULTS), /₹2,499/);
  assert.match(doorPoints(hireFeeText(PRICING_DEFAULTS)).employer.at(-1)!.text, /^₹5,000 \(or \$50\) per hire when a candidate accepts your offer/);
  assert.match(perHireEmployerPayAnswer(DEFAULT_FEE, hireFeeText(PRICING_DEFAULTS)), /^The fixed ₹5,000 \(or \$50\) per-hire charge on Espresso/);
});

test("default: the pricing FAQ monthly answer is the published one", () => {
  const p4 = pricingFaq("₹5,000", DEFAULT_FEE, PRICING_DEFAULTS).find((f) => f.id === "p4")!;
  assert.equal(
    p4.answer,
    "Multiply the hourly rate by the hours you need. A Monday-to-Friday month is billed as 22 working days of 8 hours, 176 hours: ₹17,600 a month on Cappuccino (₹100/hr) and ₹35,200 on Latte (₹200/hr), plus the one-time per-hire fee on Espresso (free for now on Cappuccino and Latte). The calculator on the pricing page does this for your own schedule.",
  );
});

test("edited (hourly 12300, fee 650000, stipend 900000): every text surface follows", () => {
  const fee = feeSettingOf(EDITED);
  assert.equal(rateText(EDITED, "assured"), "₹123/hr");
  assert.deepEqual(hireFeeText(EDITED), { inr: "₹6,500", usd: "$65" });
  assert.equal(activationFeeText(EDITED), "₹3,499");
  assert.equal(pricingMetaSentence(EDITED), "Three published plans from ₹123/hr to ₹123/hr, a ₹6,500 per-hire fee on every plan");
  assert.match(perHireMetaClause(EDITED), /₹6,500/);
  assert.equal(monthlyText(EDITED, "skilled"), "₹21,648");
  const brand = brandContext(fee, EDITED);
  assert.match(brand, /₹3,499 one-time AI interview/);
  assert.match(brand, /Cappuccino ₹123\/hr .* Latte ₹123\/hr/);
  assert.match(brand, /₹6,500 per-hire charge applies on every plan/);
  assert.match(brand, /\$1\.23\/hr/);
  assert.match(systemPrompt(EDITED), /AI interview ₹3,499 one-time/);
  assert.match(systemPrompt(EDITED), /Espresso ₹123\/hr/);
  assert.doesNotMatch(`${brand}${systemPrompt(EDITED)}${platformHelpContext(EDITED)}`, /₹2,499|₹5,000|₹100\/hr|₹200\/hr/);
  const p4 = pricingFaq("₹6,500", fee, EDITED).find((f) => f.id === "p4")!;
  assert.match(p4.answer, /₹21,648 a month on Cappuccino \(₹123\/hr\) and ₹21,648 on Latte \(₹123\/hr\), plus the one-time per-hire fee on every plan/);
  assert.match(doorPoints(hireFeeText(EDITED)).employer.at(-1)!.text, /^₹6,500 \(or \$65\)/);
  assert.match(perHireEmployerPayAnswer(fee, hireFeeText(EDITED)), /₹6,500 \(or \$65\)/);
  assert.deepEqual(llmsInternMoneyLines(EDITED), [
    "- Candidate AI interview fee: ₹3,499 one-time, paid by the candidate (INR)",
    "- Intern stipend: a fixed monthly stipend of ₹9,000 a month at a score of 6 to 8 and ₹9,000 a month at 8 to 10; none below a score of 6",
  ]);
});

test("different fees on the charged plans are quoted as a range, not one band's fee for another", () => {
  const cfg = parsePricingConfig({
    plans: (["standard", "skilled", "assured"] as const).map((id, i) => ({ slug: SLUG[id], currency: "INR", isActive: true, region: null, priceHourlyMinor: 10000, perHireChargeMinor: [500000, 650000, 720000][i] })),
    feeSetting: { standard: true, skilled: true, assured: false },
  });
  assert.equal(hireFeeText(cfg).inr, "₹5,000 to ₹6,500");
});

test("llms.txt default lines carry the activation fee and the stipends", () => {
  assert.deepEqual(llmsInternMoneyLines(PRICING_DEFAULTS), [
    "- Candidate AI interview fee: ₹2,499 one-time, paid by the candidate (INR)",
    "- Intern stipend: a fixed monthly stipend of ₹8,000 a month at a score of 6 to 8 and ₹15,000 a month at 8 to 10; none below a score of 6",
  ]);
});

test("client bands: score card and plan cards read the live config, in both currencies", () => {
  const inr = bandsForConfig(EDITED, true);
  const usd = bandsForConfig(EDITED, false);
  assert.deepEqual(inr.map((b) => b.rateMinor), [12300, 12300, 12300]);
  assert.deepEqual(inr.map((b) => b.perHireMinor), [650000, 650000, 650000]);
  assert.deepEqual(usd.map((b) => b.rateMinor), [123, 123, 123]);
  assert.deepEqual(bandsForConfig(PRICING_DEFAULTS, true).map((b) => b.rateMinor), [0, 10000, 20000]);
});

test("calculator: the month and the first month are billing's own planMonthMinor", () => {
  const m = planMonthMinor({ hourlyMinor: 12300, perHireMinor: 650000, perHireFree: false, schedule: "mon_fri" });
  assert.equal(m.hours, 176);
  assert.equal(m.monthlyMinor, 12300 * 176);
  assert.equal(m.firstMonthMinor, 12300 * 176 + 650000);
  assert.equal(planMonthMinor({ hourlyMinor: 10000, perHireMinor: 500000, perHireFree: true, schedule: "mon_fri" }).firstMonthMinor, 1_760_000);
});
