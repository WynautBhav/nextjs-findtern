import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRICE_ERROR,
  parseRupees,
  parseWholeRupees,
  planDraftEq,
  planDraftFromPlan,
  planPatchBody,
  rupeesEq,
  wholeRupeesEq,
  validateActivationFee,
  validatePlanDraft,
  validateStipends,
} from "./pricing-draft.ts";

const plan = {
  id: "p1",
  displayName: "Cappuccino",
  priceHourlyMinor: 10000,
  perHireChargeMinor: 500000,
  compareAtHourlyMinor: null,
  compareAtPerHireMinor: 750000,
  internshipDuration: "3 months",
  features: ["Who", "6-8/10", "What"],
  featureList: [{ label: "Interview", included: true }],
  isActive: true,
};

test("rupee parsing: decimals ok, blank/garbled/too big are null, never coerced to 0", () => {
  assert.equal(parseRupees("450"), 45000);
  assert.equal(parseRupees("99.50"), 9950);
  assert.equal(parseRupees(".5"), 50);
  assert.equal(parseRupees("12."), 1200);
  for (const bad of ["", "  ", "abc", "1.2.3", "-5", "1e3", "1000001"]) assert.equal(parseRupees(bad), null, bad);
  assert.equal(parseRupees("1000000"), 100_000_000);
  assert.equal(parseWholeRupees("8000"), 800000);
  assert.equal(parseWholeRupees("80.5"), null);
  assert.equal(parseWholeRupees(""), null);
});

test("a draft built from a plan validates and round-trips to the PATCH body", () => {
  const d = planDraftFromPlan(plan);
  assert.equal(validatePlanDraft(d, plan.features), null);
  assert.deepEqual(planPatchBody("p1", d), {
    id: "p1",
    displayName: "Cappuccino",
    priceHourlyMinor: 10000,
    compareAtHourlyMinor: null,
    perHireChargeMinor: 500000,
    compareAtPerHireMinor: 750000,
    internshipDuration: "3 months",
    features: ["Who", "6-8/10", "What"],
    featureList: [{ label: "Interview", included: true }],
    isActive: true,
  });
});

test("the body never carries isFeatured (the flag is saved on its own, one choice for the whole set)", () => {
  assert.equal("isFeatured" in planPatchBody("p1", planDraftFromPlan(plan)), false);
});

test("a blank or garbled price is an issue on that field, with the usual message", () => {
  const d = planDraftFromPlan(plan);
  assert.deepEqual(validatePlanDraft({ ...d, hourly: "" }, plan.features), { field: "hourly", message: PRICE_ERROR });
  assert.deepEqual(validatePlanDraft({ ...d, perHire: "x" }, plan.features), { field: "perHire", message: PRICE_ERROR });
  assert.deepEqual(validatePlanDraft({ ...d, hourlyWas: "x" }, plan.features), { field: "hourlyWas", message: PRICE_ERROR });
  // The was-prices may be blank (hidden strikethrough).
  assert.equal(validatePlanDraft({ ...d, hourlyWas: "", perHireWas: "" }, plan.features), null);
});

test("name, lengths and the legacy score band are checked before the server refuses them", () => {
  const d = planDraftFromPlan(plan);
  assert.equal(validatePlanDraft({ ...d, name: "  " }, plan.features)?.field, "name");
  assert.equal(validatePlanDraft({ ...d, name: "x".repeat(41) }, plan.features)?.field, "name");
  assert.equal(validatePlanDraft({ ...d, duration: "x".repeat(61) }, plan.features)?.field, "duration");
  assert.equal(validatePlanDraft({ ...d, features: ["Who", "x".repeat(121), "What"] }, plan.features)?.field, "features");
  assert.equal(validatePlanDraft({ ...d, featureList: [{ label: "x".repeat(121), included: true }] }, plan.features)?.field, "featureList");
  const band = validatePlanDraft({ ...d, features: ["Who", "banana", "What"] }, plan.features);
  assert.equal(band?.field, "features");
  assert.match(band?.message ?? "", /legacy/i);
});

test("blank checklist rows are dropped from the body and do not count as a change", () => {
  const d = planDraftFromPlan(plan);
  const withBlank = { ...d, featureList: [...d.featureList, { label: "  ", included: true }] };
  assert.equal(planDraftEq(d, withBlank), true);
  assert.deepEqual(planPatchBody("p1", withBlank).featureList, plan.featureList);
});

test("planDraftEq: 100 and 100.00 are the same price; a changed field is a change", () => {
  const d = planDraftFromPlan(plan);
  assert.equal(planDraftEq(d, { ...d, hourly: "100.00" }), true);
  assert.equal(planDraftEq(d, { ...d, hourly: "101" }), false);
  assert.equal(planDraftEq(d, { ...d, name: " Cappuccino " }), true);
  assert.equal(planDraftEq(d, { ...d, active: false }), false);
  assert.equal(planDraftEq(d, { ...d, features: ["Who", "6-8/10", "More"] }), false);
  // An unparsable price differs from the saved one (so it shows as unsaved).
  assert.equal(planDraftEq(d, { ...d, hourly: "" }), false);
});

test("a plan saved with fewer than 3 comparison rows still gets 3 inputs", () => {
  assert.deepEqual(planDraftFromPlan({ ...plan, features: ["Who"] }).features, ["Who", "", ""]);
});

test("activation fee: rupees to paise, must be above zero", () => {
  assert.deepEqual(validateActivationFee("499"), { ok: true, minor: 49900 });
  assert.deepEqual(validateActivationFee("0"), { ok: false, message: "The fee must be above zero." });
  assert.deepEqual(validateActivationFee(""), { ok: false, message: PRICE_ERROR });
});

test("stipends: whole rupees only, named by band, sent with Espresso as null", () => {
  assert.deepEqual(validateStipends({ skilled: "8000", assured: "15000" }), {
    ok: true,
    bands: { standard: null, skilled: 800000, assured: 1500000 },
  });
  const bad = validateStipends({ skilled: "8000", assured: "15.5" });
  assert.equal(bad.ok, false);
  assert.equal(!bad.ok && bad.field, "assured");
  assert.match(!bad.ok ? bad.message : "", /Latte.*whole number of rupees/);
  assert.equal(!validateStipends({ skilled: "", assured: "1" }).ok, true);
});

test("rupeesEq / wholeRupeesEq: equal amounts match, unparsable text only matches itself", () => {
  assert.equal(rupeesEq("100", "100.00"), true);
  assert.equal(rupeesEq("100", "101"), false);
  assert.equal(rupeesEq("", "100"), false);
  assert.equal(rupeesEq("", " "), true);
  assert.equal(rupeesEq("abc", "abd"), false);
  assert.equal(wholeRupeesEq("8000", "8000"), true);
  assert.equal(wholeRupeesEq("8000", "80.5"), false);
});
