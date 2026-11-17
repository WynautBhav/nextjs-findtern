import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { PRICING_DEFAULTS, parsePricingConfig, type PricingConfig } from "../pricing-config.ts";
import { FAQ_EMPLOYER, FAQ_INTERN, faqEmployer, faqIntern } from "./faq.ts";
import { INTERN_TERMS, internTerms } from "./legal-intern.ts";
import { PLATFORM_TERMS, platformTerms } from "./legal.ts";

/**
 * FAQ answers and legal terms quote the AI interview fee, the hiring fee, Espresso's struck-through rate and the intern
 * stipends. Those figures now come from the pricing config through template functions, so an admin's edit reaches them.
 *
 * Proof the words did not change: fixtures/copy-before-figures.json holds the text exactly as it was on master
 * (dbbef6a7, captured with `git show master:src/lib/content/{faq,legal,legal-intern}.ts`). At the default config the
 * rendered text must equal it character for character. Legal wording is unchanged; only the figures are substituted.
 * If someone edits this copy on purpose, regenerate the fixture in the same commit.
 */

type Before = {
  faqIntern: { id: string; question: string; answer: string }[];
  faqEmployer: { id: string; question: string; answer: string }[];
  platformTerms: string;
  internTerms: string;
};
const before = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/copy-before-figures.json"), "utf8")) as Before;
const text = (rows: { id: string; question: string; answer: string }[]) => rows.map(({ id, question, answer }) => ({ id, question, answer }));

test("default config: the intern FAQ reads exactly as before", () => {
  assert.deepEqual(text(faqIntern(PRICING_DEFAULTS)), before.faqIntern);
  assert.deepEqual(text(FAQ_INTERN), before.faqIntern, "the exported constant is the default rendering");
});

test("default config: the employer FAQ reads exactly as before", () => {
  assert.deepEqual(text(faqEmployer(PRICING_DEFAULTS)), before.faqEmployer);
  assert.deepEqual(text(FAQ_EMPLOYER), before.faqEmployer);
});

test("default config: the platform and intern terms read exactly as before (legal wording untouched)", () => {
  assert.equal(platformTerms(PRICING_DEFAULTS).html, before.platformTerms);
  assert.equal(PLATFORM_TERMS.html, before.platformTerms);
  assert.equal(internTerms(PRICING_DEFAULTS).html, before.internTerms);
  assert.equal(INTERN_TERMS.html, before.internTerms);
});

const edited: PricingConfig = parsePricingConfig({
  activationFeeMinor: 399900,
  stipendBands: { skilled: 900000, assured: 1650000 },
  plans: [
    { slug: "espresso", currency: "INR", isActive: true, priceHourlyMinor: 0, perHireChargeMinor: 650000, compareAtHourlyMinor: 7500 },
    { slug: "cappuccino", currency: "INR", isActive: true, priceHourlyMinor: 10000, perHireChargeMinor: 500000 },
    { slug: "latte", currency: "INR", isActive: true, priceHourlyMinor: 20000, perHireChargeMinor: 500000 },
  ],
});

test("an edited config reaches the FAQ: the interview fee, the hiring fee and the struck-through rate follow it", () => {
  const all = [...faqIntern(edited), ...faqEmployer(edited)].map((f) => `${f.question}\n${f.answer}`).join("\n");
  assert.match(all, /one-time fee of ₹3,999\./);
  assert.match(all, /then ₹3,999 for each later attempt/);
  assert.match(all, /Is the ₹3,999 AI interview fee refundable/);
  assert.match(all, /shown as ₹75\/hr but is currently free, plus the ₹6,500 hiring fee/);
  assert.doesNotMatch(all, /₹2,499|₹5,000|₹50\/hr/);
});

test("an edited config reaches the legal terms: the interview fee and the stipends follow it", () => {
  assert.match(platformTerms(edited).html, /₹3,999 \(incl\. GST\)/);
  assert.doesNotMatch(platformTerms(edited).html, /₹2,499/);
  const intern = internTerms(edited).html;
  assert.match(intern, /₹0 below 6, ₹9,000 a month from 6 up to 8, and ₹16,500 a month from 8 and above/);
  assert.doesNotMatch(intern, /₹8,000|₹15,000/);
});

test("Espresso's rate sentence stays true when the rate is not free, or when no struck-through rate is kept", () => {
  const paid = parsePricingConfig({ plans: [{ slug: "espresso", currency: "INR", isActive: true, priceHourlyMinor: 4000, perHireChargeMinor: 500000 }] });
  assert.match(faqEmployer(paid).map((f) => f.answer).join("\n"), /The intern’s rate is ₹40\/hr, plus the ₹5,000 hiring fee\./);
  const noStrike = parsePricingConfig({ plans: [{ slug: "espresso", currency: "INR", isActive: true, priceHourlyMinor: 0, perHireChargeMinor: 500000, compareAtHourlyMinor: null }] });
  assert.match(faqEmployer(noStrike).map((f) => f.answer).join("\n"), /The intern’s rate is currently free, plus the ₹5,000 hiring fee\./);
});

test("employers never see intern pay, whatever the config says", () => {
  const pay = /stipend|bonus|payout|₹\s?9,000|₹\s?16,500|₹\s?8,000|₹\s?15,000/i;
  for (const config of [PRICING_DEFAULTS, edited]) {
    for (const f of faqEmployer(config)) assert.doesNotMatch(`${f.question} ${f.answer}`, pay, f.question);
  }
});
