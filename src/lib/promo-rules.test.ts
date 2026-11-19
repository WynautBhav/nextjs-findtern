import test from "node:test";
import assert from "node:assert/strict";

import { collegeCodeMemberProblem, collegeCodeDeleteProblem, COLLEGE_CODE_UNDELETABLE, collegeCodeEditProblem, COLLEGE_CODE_LOCKED, employerPromoTooLarge, promoDiscount, promoProblem, type PromoRow } from "./promo-rules.ts";

const base: PromoRow = {
  code: "TEST",
  discountType: "percentage",
  discountValue: 25,
  maxUsages: null,
  usedCount: 0,
  minOrderAmountMinor: null,
  validFrom: null,
  validUntil: null,
  isActive: true,
};

test("percentage discount", () => {
  assert.equal(promoDiscount(base, 2100000, "INR"), 525000);
  assert.equal(promoDiscount(base, 21000, "USD"), 5250);
});

test("fixed discount converts for USD and is capped at the order", () => {
  const fixed = { ...base, discountType: "fixed", discountValue: 500000 }; // ₹5,000 in paise
  assert.equal(promoDiscount(fixed, 2100000, "INR"), 500000);
  assert.equal(promoDiscount(fixed, 21000, "USD"), 5000);
  assert.equal(promoDiscount(fixed, 300000, "INR"), 300000);
});

test("validity checks", () => {
  const now = new Date("2026-10-18T00:00:00Z");
  assert.equal(promoProblem(base, 1000, "INR", now), null);
  assert.equal(promoProblem({ ...base, isActive: false }, 1000, "INR", now), "Invalid promo code");
  assert.equal(
    promoProblem({ ...base, validUntil: new Date("2026-10-01") }, 1000, "INR", now),
    "Promo code expired",
  );
  assert.equal(
    promoProblem({ ...base, validFrom: new Date("2026-11-01") }, 1000, "INR", now),
    "Promo code is not active yet",
  );
  assert.equal(promoProblem({ ...base, maxUsages: 2, usedCount: 2 }, 1000, "INR", now), "Promo code exhausted");
});

test("minimum order converts for USD", () => {
  const min = { ...base, minOrderAmountMinor: 1000000 }; // ₹10,000
  assert.match(promoProblem(min, 999999, "INR") ?? "", /at least ₹10,000/);
  assert.equal(promoProblem(min, 1000000, "INR"), null);
  assert.notEqual(promoProblem(min, 9999, "USD"), null); // $99.99
  assert.equal(promoProblem(min, 10000, "USD"), null); // $100
});

test("promo audience and window", async () => {
  const { promoAudienceProblem, promoWindowProblem } = await import("./promo-rules.ts");
  assert.equal(promoAudienceProblem("both", "employer"), null);
  assert.equal(promoAudienceProblem(undefined, "intern"), null);
  assert.ok(promoAudienceProblem("intern", "employer"));
  assert.ok(promoAudienceProblem("employer", "intern"));
  assert.ok(promoWindowProblem(new Date("2026-11-02"), new Date("2026-11-01")));
  assert.equal(promoWindowProblem(new Date("2026-11-01"), new Date("2026-11-01")), null);
  assert.equal(promoWindowProblem(null, new Date("2026-11-01")), null);
});

test("a promo code is for upfront payment only", async () => {
  const { promoModeProblem } = await import("./promo-rules.ts");
  assert.equal(promoModeProblem("upfront"), null);
  assert.match(promoModeProblem("monthly") ?? "", /upfront/);
});

test("employer code covering the whole stipend is too large; partial is not", () => {
  const stipend = 3520000;
  const tooLarge = (row: PromoRow) => employerPromoTooLarge(promoDiscount(row, stipend, "INR"), stipend);
  assert.equal(tooLarge({ ...base, discountValue: 10 }), false);
  assert.equal(tooLarge({ ...base, discountValue: 99 }), false);
  assert.equal(tooLarge({ ...base, discountValue: 100 }), true);
  assert.equal(tooLarge({ ...base, discountType: "fixed", discountValue: stipend }), true);
  assert.equal(tooLarge({ ...base, discountType: "fixed", discountValue: 10000000 }), true);
  assert.equal(tooLarge({ ...base, discountType: "fixed", discountValue: stipend - 1 }), false);
});

test("the general editor cannot change a college code's discount, audience or cap", () => {
  const college = { collegeId: "c1", discountType: "percentage", discountValue: 100, appliesTo: "intern", maxUsages: 300 };
  assert.equal(collegeCodeEditProblem(college, { discountValue: 50 }), COLLEGE_CODE_LOCKED);
  assert.equal(collegeCodeEditProblem(college, { discountType: "fixed" }), COLLEGE_CODE_LOCKED);
  assert.equal(collegeCodeEditProblem(college, { appliesTo: "both" }), COLLEGE_CODE_LOCKED);
  assert.equal(collegeCodeEditProblem(college, { maxUsages: 500 }), COLLEGE_CODE_LOCKED);
  assert.equal(collegeCodeEditProblem(college, { maxUsages: null }), COLLEGE_CODE_LOCKED);
  // The form sends every field: unchanged values, and other fields, still save.
  assert.equal(collegeCodeEditProblem(college, { discountType: "percentage", discountValue: 100, appliesTo: "intern", maxUsages: 300 }), null);
  assert.equal(collegeCodeEditProblem(college, {}), null);
  // An ordinary code is free to change.
  assert.equal(collegeCodeEditProblem({ ...college, collegeId: null }, { discountValue: 50, maxUsages: 5 }), null);
  assert.equal(collegeCodeEditProblem(null, { discountValue: 50 }), null);
});

test("a college's promo code cannot be deleted on its own", () => {
  assert.equal(collegeCodeDeleteProblem("college-1"), COLLEGE_CODE_UNDELETABLE);
  assert.equal(collegeCodeDeleteProblem(null), null);
});

test("a student in another college can't redeem this college's code", () => {
  assert.match(collegeCodeMemberProblem("college-b", "college-a") ?? "", /another college/);
  assert.equal(collegeCodeMemberProblem("college-a", "college-a"), null);
  assert.equal(collegeCodeMemberProblem(null, "college-a"), null);
  assert.equal(collegeCodeMemberProblem(undefined, "college-a"), null);
});

// ---- Admin audit (package S) -------------------------------------------------------------------------------------
import { INVALID_PROMO, promoExpiryProblem, promoState, promoDeleteProblem, promoHoldProblem, promoMaxUsagesProblem, promoRenameProblem } from "./promo-rules.ts";

test("max uses can't be set below the uses already made; clearing it (unlimited) is always fine", () => {
  assert.equal(promoMaxUsagesProblem(null, 40), null);
  assert.equal(promoMaxUsagesProblem(undefined, 40), null);
  assert.equal(promoMaxUsagesProblem(40, 40), null);
  assert.equal(promoMaxUsagesProblem(100, 40), null);
  assert.match(promoMaxUsagesProblem(39, 40) ?? "", /Already used 40 times.*can't go below/);
  assert.match(promoMaxUsagesProblem(1, 2) ?? "", /Already used 2 times/);
});

test("a used code, or one on an open payment, is never deleted: turn it off instead", () => {
  assert.equal(promoDeleteProblem({ usedCount: 0, usageRows: 0, openOrders: 0 }), null);
  assert.match(promoDeleteProblem({ usedCount: 3, usageRows: 3, openOrders: 0 }) ?? "", /used 3 times.*Turn it off/);
  // used_count can be edited by hand or drift; a usage row alone also protects the history.
  assert.match(promoDeleteProblem({ usedCount: 0, usageRows: 1, openOrders: 0 }) ?? "", /used 1 time\b.*Turn it off/);
  assert.match(promoDeleteProblem({ usedCount: 0, usageRows: 0, openOrders: 1 }) ?? "", /open payment/);
});

test("holds: open payments of other accounts count against the cap until they are paid or expire", () => {
  const capped = { maxUsages: 5, usedCount: 3, collegeId: null };
  assert.equal(promoHoldProblem(capped, 0), null);
  assert.equal(promoHoldProblem(capped, 1), null); // 3 used + 1 held = 4 of 5, one left for me
  assert.match(promoHoldProblem(capped, 2) ?? "", /still open/); // 3 + 2 = 5: the last use is held by someone mid-payment
  assert.equal(promoHoldProblem({ ...capped, maxUsages: null }, 50), null);
  assert.match(promoHoldProblem({ maxUsages: 1, usedCount: 0, collegeId: "c1" }, 1) ?? "", /seat/i);
});

test("a code that has been used, or is on an open payment, can't be renamed: orders keep the old name and would stop counting", () => {
  assert.equal(promoRenameProblem({ usedCount: 0, usageRows: 0, openOrders: 0 }), null);
  assert.match(promoRenameProblem({ usedCount: 2, usageRows: 2, openOrders: 0 }) ?? "", /used can't be renamed/);
  assert.match(promoRenameProblem({ usedCount: 0, usageRows: 1, openOrders: 0 }) ?? "", /can't be renamed/);
  assert.match(promoRenameProblem({ usedCount: 0, usageRows: 0, openOrders: 1 }) ?? "", /open payment/);
});

test("B-53: a refused code is 422 with the same message, never 404", () => {
  assert.equal(INVALID_PROMO.status, 422);
  assert.equal(INVALID_PROMO.error, "Invalid promo code");
  assert.equal(INVALID_PROMO.ok, false);
});

test("B-53: quotePromo returns the shared refusal and no longer answers 404", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./promo.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /status: 404/);
  assert.equal(src.match(/\bINVALID_PROMO\b/g)?.length, 4, "import + null byte, unknown or off, waiver that discounts nothing");
  assert.match(src, /deadWaiver\) return \{ ok: false, error: deadWaiver, status: 422 \}/);
});

test("B-28: promoState is off, expired, used up or active, in that order of precedence", () => {
  const now = new Date("2026-11-19T00:00:00Z");
  const row = { isActive: true, validUntil: null as Date | null, maxUsages: 5 as number | null, usedCount: 2 };
  assert.equal(promoState(row, now), "active");
  assert.equal(promoState({ ...row, maxUsages: null }, now), "active", "unlimited is never used up");
  assert.equal(promoState({ ...row, usedCount: 5 }, now), "used up");
  assert.equal(promoState({ ...row, usedCount: 9 }, now), "used up");
  assert.equal(promoState({ ...row, validUntil: new Date("2026-11-18T00:00:00Z") }, now), "expired");
  assert.equal(promoState({ ...row, validUntil: new Date("2026-11-20T00:00:00Z") }, now), "active");
  assert.equal(promoState({ ...row, usedCount: 5, validUntil: new Date("2026-11-18T00:00:00Z") }, now), "expired");
  assert.equal(promoState({ ...row, isActive: false, usedCount: 5 }, now), "off");
});

test("B-27: a past expiry is refused; today-onward and no expiry pass; an unchanged date on edit passes", () => {
  const now = new Date("2026-11-19T10:00:00Z");
  assert.match(promoExpiryProblem(new Date("2020-01-01T00:00:00Z"), null, now) ?? "", /in the past/);
  assert.equal(promoExpiryProblem(new Date("2026-11-19T10:00:00Z"), null, now), null, "exactly now is not past");
  assert.equal(promoExpiryProblem(new Date("2026-12-01T00:00:00Z"), null, now), null);
  assert.equal(promoExpiryProblem(null, null, now), null);
  assert.equal(promoExpiryProblem(undefined, null, now), null);
  const old = new Date("2026-11-01T12:00:00Z");
  assert.equal(promoExpiryProblem(new Date(old.getTime() + 20_000), old, now), null, "same minute as the stored value is not a change");
  assert.match(promoExpiryProblem(new Date("2026-10-01T00:00:00Z"), old, now) ?? "", /in the past/, "moving to another past date is refused");
});
