import test from "node:test";
import assert from "node:assert/strict";

import {
  FULL_WAIVER_LIMITS,
  FULL_WAIVER_TYPE,
  WAIVER_ALPHABET,
  generateWaiverCode,
  isFullWaiver,
  waiverCodeTail,
  waiverCreateProblem,
  waiverEditProblem,
  waiverPricing,
  waiverRowProblem,
} from "./full-waiver.ts";
import { promoCodeProblem } from "./admin/promo-edit-rules.ts";
import { promoDiscount, promoProblem, type PromoRow } from "./promo-rules.ts";

const NOW = new Date("2026-11-17T10:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const waiverRow: PromoRow = {
  code: "FREE-ABCD-EFGH-JKMN",
  discountType: FULL_WAIVER_TYPE,
  discountValue: 100,
  maxUsages: 1,
  usedCount: 0,
  minOrderAmountMinor: null,
  validFrom: null,
  validUntil: day(7),
  isActive: true,
};

// ---------------------------------------------------------------- the code generator

test("generated codes have the FREE- prefix, 12 random characters, all from the unambiguous alphabet", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateWaiverCode();
    assert.match(code, /^FREE-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const body = code.slice(5).replaceAll("-", "");
    assert.equal(body.length, 12);
    for (const ch of body) assert.ok(WAIVER_ALPHABET.includes(ch), `${ch} is not in the alphabet`);
    assert.equal(promoCodeProblem(code), null, "the generated code passes the promo code format rule");
  }
});

test("the alphabet has no look-alike characters (0 O 1 I L)", () => {
  for (const bad of "01OIL") assert.ok(!WAIVER_ALPHABET.includes(bad), `${bad} must not be in the alphabet`);
  assert.equal(new Set(WAIVER_ALPHABET).size, WAIVER_ALPHABET.length, "no repeated letters");
});

test("a code is at least 12 random characters long, at least 55 bits of entropy", () => {
  assert.ok(12 * Math.log2(WAIVER_ALPHABET.length) >= 55);
});

test("generated codes do not repeat, and every alphabet character shows up (no dead characters)", () => {
  const seen = new Set<string>();
  const chars = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const code = generateWaiverCode();
    assert.ok(!seen.has(code), "a code repeated");
    seen.add(code);
    for (const ch of code.slice(5).replaceAll("-", "")) chars.add(ch);
  }
  assert.equal(chars.size, WAIVER_ALPHABET.length);
});

test("the generator draws from the random source it is given, and rejects bytes that would bias a character", () => {
  // A source of all 255s is always rejected (255 is above the largest multiple of the alphabet size), so the generator must keep asking.
  let calls = 0;
  const source = (n: number) => {
    calls++;
    return new Uint8Array(n).fill(calls < 3 ? 255 : 0);
  };
  const code = generateWaiverCode(source);
  assert.equal(code, `FREE-${WAIVER_ALPHABET[0].repeat(4)}-${WAIVER_ALPHABET[0].repeat(4)}-${WAIVER_ALPHABET[0].repeat(4)}`);
  assert.ok(calls >= 3);
});

test("character frequency is flat: no character is more than 1.4x or less than 0.6x its fair share over 31k draws", () => {
  const counts = new Map<string, number>();
  for (let i = 0; i < 2600; i++) for (const ch of generateWaiverCode().slice(5).replaceAll("-", "")) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const fair = (2600 * 12) / WAIVER_ALPHABET.length;
  for (const [ch, n] of counts) assert.ok(n > fair * 0.6 && n < fair * 1.4, `${ch}: ${n} vs fair ${fair}`);
});

test("waiverCodeTail shows only the last 4 characters", () => {
  assert.equal(waiverCodeTail("FREE-ABCD-EFGH-JKMN"), "JKMN");
  assert.equal(waiverCodeTail("AB"), "AB");
  assert.equal(waiverCodeTail(""), "");
});

// ---------------------------------------------------------------- pricing

test("a full waiver takes the whole order, the hiring fee included, and leaves exactly zero to pay", () => {
  assert.deepEqual(waiverPricing(3_520_000), { discountMinor: 3_520_000, payableMinor: 0 });
  assert.deepEqual(waiverPricing(500_000), { discountMinor: 500_000, payableMinor: 0 }, "a fee-only order is waived too");
});

test("promoDiscount for a full-waiver row is the whole order in either currency", () => {
  assert.equal(promoDiscount(waiverRow, 3_520_000, "INR"), 3_520_000);
  assert.equal(promoDiscount(waiverRow, 44_000, "USD"), 44_000);
});

test("a percentage 100 code is NOT a full waiver: only the explicit type is", () => {
  assert.equal(isFullWaiver({ discountType: "percentage", discountValue: 100 }), false);
  assert.equal(isFullWaiver({ discountType: "fixed", discountValue: 100 }), false);
  assert.equal(isFullWaiver({ discountType: FULL_WAIVER_TYPE, discountValue: 100 }), true);
});

// ---------------------------------------------------------------- create validation (caps)

const ok = { maxUsages: 1, validUntil: day(7), appliesTo: "employer", now: NOW };

test("a valid full-waiver request passes", () => {
  assert.equal(waiverCreateProblem(ok), null);
  assert.equal(waiverCreateProblem({ ...ok, maxUsages: 25, validUntil: day(30), appliesTo: "both" }), null);
  assert.equal(waiverCreateProblem({ ...ok, appliesTo: "intern" }), null);
});

test("max uses is required and capped at 25", () => {
  assert.match(waiverCreateProblem({ ...ok, maxUsages: null }) ?? "", /max uses/i);
  assert.match(waiverCreateProblem({ ...ok, maxUsages: undefined }) ?? "", /max uses/i);
  assert.match(waiverCreateProblem({ ...ok, maxUsages: 0 }) ?? "", /max uses/i);
  assert.match(waiverCreateProblem({ ...ok, maxUsages: 26 }) ?? "", /25/);
  assert.match(waiverCreateProblem({ ...ok, maxUsages: 1.5 }) ?? "", /max uses/i);
  assert.equal(FULL_WAIVER_LIMITS.maxUsesCap, 25);
  assert.equal(FULL_WAIVER_LIMITS.maxUsesDefault, 1);
});

test("an expiry is required, must be in the future and at most 30 days out", () => {
  assert.match(waiverCreateProblem({ ...ok, validUntil: null }) ?? "", /expiry/i);
  assert.match(waiverCreateProblem({ ...ok, validUntil: day(-1) }) ?? "", /future/i);
  assert.match(waiverCreateProblem({ ...ok, validUntil: new Date("nope") }) ?? "", /expiry/i);
  assert.match(waiverCreateProblem({ ...ok, validUntil: new Date(day(30).getTime() + 1) }) ?? "", /30 days/);
  assert.equal(FULL_WAIVER_LIMITS.expiryDaysCap, 30);
  assert.equal(FULL_WAIVER_LIMITS.expiryDaysDefault, 7);
});

test("the audience must be chosen: employer, intern or both", () => {
  assert.match(waiverCreateProblem({ ...ok, appliesTo: undefined }) ?? "", /who can use/i);
  assert.match(waiverCreateProblem({ ...ok, appliesTo: "college" }) ?? "", /who can use/i);
});

// ---------------------------------------------------------------- a row in the DB that breaks the caps is dead

test("a waiver row with no expiry or no cap (made by hand in SQL) is refused at redemption", () => {
  assert.ok(waiverRowProblem({ ...waiverRow, validUntil: null }));
  assert.ok(waiverRowProblem({ ...waiverRow, maxUsages: null }));
  assert.ok(waiverRowProblem({ ...waiverRow, maxUsages: 500 }));
  assert.equal(waiverRowProblem(waiverRow), null);
  assert.equal(waiverRowProblem({ ...waiverRow, discountType: "percentage", validUntil: null, maxUsages: null }), null, "ordinary codes are not judged by waiver rules");
});

test("the ordinary row checks refuse an expired, exhausted, not-yet-active or disabled waiver code", () => {
  assert.equal(promoProblem(waiverRow, 100, "INR", NOW), null);
  assert.equal(promoProblem({ ...waiverRow, validUntil: day(-1) }, 100, "INR", NOW), "Promo code expired");
  assert.equal(promoProblem({ ...waiverRow, usedCount: 1 }, 100, "INR", NOW), "Promo code exhausted");
  assert.equal(promoProblem({ ...waiverRow, validFrom: day(1) }, 100, "INR", NOW), "Promo code is not active yet");
  assert.equal(promoProblem({ ...waiverRow, isActive: false }, 100, "INR", NOW), "Invalid promo code");
});

// ---------------------------------------------------------------- edits

test("a full-waiver code can only be turned on or off: its terms can't be edited", () => {
  const existing = { ...waiverRow, appliesTo: "employer" };
  assert.equal(waiverEditProblem(existing, { isActive: false }), null);
  assert.equal(waiverEditProblem(existing, { isActive: true }), null);
  assert.equal(waiverEditProblem(existing, { maxUsages: 1 }), null, "an unchanged value is not an edit");
  assert.ok(waiverEditProblem(existing, { maxUsages: 25 }));
  assert.ok(waiverEditProblem(existing, { validUntil: day(30) }));
  assert.ok(waiverEditProblem(existing, { appliesTo: "both" }));
  assert.ok(waiverEditProblem(existing, { discountValue: 50 }));
  assert.ok(waiverEditProblem(existing, { discountType: "percentage" }));
  assert.ok(waiverEditProblem(existing, { code: "SOMETHING-ELSE" }));
  assert.ok(waiverEditProblem(existing, { minOrderAmountMinor: 5 }));
});

test("an ordinary code is never blocked by the waiver edit rule", () => {
  const plain = { ...waiverRow, discountType: "percentage", appliesTo: "intern" };
  assert.equal(waiverEditProblem(plain, { maxUsages: 500, discountValue: 20 }), null);
});

// ---------------------------------------------------------------- redemption (the check settlement repeats under a row lock)

import { WAIVER_GATEWAY, waiverOrderProblem, waiverPromoRaw, waiverRedeemProblem, waiverFlagOf } from "./full-waiver.ts";

const fresh = { ...waiverRow, appliesTo: "employer" as string | null };

test("redeem: a live, in-cap code for the right audience passes", () => {
  assert.equal(waiverRedeemProblem(fresh, { audience: "employer", alreadyUsedByAccount: false, now: NOW }), null);
  assert.equal(waiverRedeemProblem({ ...fresh, appliesTo: "both" }, { audience: "intern", alreadyUsedByAccount: false, now: NOW }), null);
});

test("redeem: disabled, expired, not yet open, exhausted, wrong audience and second use by the same account are each refused", () => {
  const go = (row: typeof fresh, over: Partial<{ audience: "employer" | "intern"; alreadyUsedByAccount: boolean }> = {}) =>
    waiverRedeemProblem(row, { audience: "employer", alreadyUsedByAccount: false, now: NOW, ...over });
  assert.equal(go({ ...fresh, isActive: false }), "Invalid promo code");
  assert.equal(go({ ...fresh, validUntil: day(-0.001) }), "Promo code expired");
  assert.equal(go({ ...fresh, validFrom: day(1) }), "Promo code is not active yet");
  assert.equal(go({ ...fresh, usedCount: 1 }), "Promo code exhausted");
  assert.equal(go(fresh, { audience: "intern" }), "This code is for companies only");
  assert.equal(go({ ...fresh, appliesTo: "intern" }), "This code is for interns only");
  assert.equal(go(fresh, { alreadyUsedByAccount: true }), "You have already used this code");
  assert.equal(go({ ...fresh, validUntil: null }), "Invalid promo code", "a waiver row with no expiry is dead");
  assert.equal(go({ ...fresh, maxUsages: 26 }), "Invalid promo code");
});

test("the order's promo block records it as a full waiver with the code id, the list value waived, and the zero payable", () => {
  const raw = waiverPromoRaw({ code: "FREE-ABCD-EFGH-JKMN", promoCodeId: "p1", waivedMinor: 3_520_000 });
  assert.deepEqual(raw, { promoCode: "FREE-ABCD-EFGH-JKMN", discountMinor: 3_520_000, fullWaiver: true, promoCodeId: "p1", waivedMinor: 3_520_000 });
  assert.equal(WAIVER_GATEWAY, "promo_full_waiver");
});

test("waiverFlagOf reads the flag from an employer order (raw.promo) and an intern order (raw), and nothing else", () => {
  assert.equal(waiverFlagOf({ promo: { fullWaiver: true, promoCodeId: "p1", waivedMinor: 5 } })?.promoCodeId, "p1");
  assert.equal(waiverFlagOf({ fullWaiver: true, promoCodeId: "p2", waivedMinor: 5 })?.promoCodeId, "p2");
  assert.equal(waiverFlagOf({ promo: { promoCode: "X", discountMinor: 5 } }), null);
  assert.equal(waiverFlagOf({ promo: { fullWaiver: "true" } }), null, "only a real boolean true counts");
  assert.equal(waiverFlagOf(null), null);
  assert.equal(waiverFlagOf({}), null);
});

test("an order flagged as a waiver must be a zero-amount waiver-gateway order, or settlement refuses it", () => {
  const raw = { promo: { fullWaiver: true, promoCodeId: "p1", waivedMinor: 5 } };
  assert.equal(waiverOrderProblem({ gateway: WAIVER_GATEWAY, amountMinor: 0, raw }), null);
  assert.ok(waiverOrderProblem({ gateway: WAIVER_GATEWAY, amountMinor: 100, raw }), "a waiver order with money on it is not settled");
  assert.ok(waiverOrderProblem({ gateway: "razorpay", amountMinor: 0, raw }), "a Razorpay order can't carry the waiver flag");
  assert.equal(waiverOrderProblem({ gateway: "razorpay", amountMinor: 100, raw: { promo: { promoCode: "X" } } }), null, "ordinary orders are untouched");
  assert.ok(waiverOrderProblem({ gateway: WAIVER_GATEWAY, amountMinor: 0, raw: {} }), "the waiver gateway needs the flag too");
});

// ---------------------------------------------------------------- regression: ordinary codes behave exactly as before

import { promoDiscountProblem } from "./admin/promo-edit-rules.ts";
import { employerPromoTooLarge, promoModeProblem } from "./promo-rules.ts";

test("regression: an ordinary 100% percentage code is still refused for employers, and 100% stays an intern-only thing", () => {
  assert.equal(promoDiscountProblem({ discountType: "percentage", discountValue: 100, appliesTo: "employer" }), "Only an intern code can be 100%. Employer codes can't cover the whole stipend.");
  assert.equal(promoDiscountProblem({ discountType: "percentage", discountValue: 100, appliesTo: "both" }), "Only an intern code can be 100%. Employer codes can't cover the whole stipend.");
  assert.equal(promoDiscountProblem({ discountType: "percentage", discountValue: 100, appliesTo: "intern" }), null);
  assert.equal(employerPromoTooLarge(1000, 1000), true, "an ordinary employer code that takes the whole discountable amount is still refused at quote time");
});

test("regression: ordinary percentage and fixed discounts price exactly as before, in INR and USD", () => {
  const pct: PromoRow = { ...waiverRow, discountType: "percentage", discountValue: 25 };
  const fixed: PromoRow = { ...waiverRow, discountType: "fixed", discountValue: 500_000 };
  assert.equal(promoDiscount(pct, 2_100_000, "INR"), 525_000);
  assert.equal(promoDiscount(pct, 21_000, "USD"), 5_250);
  assert.equal(promoDiscount(fixed, 2_100_000, "INR"), 500_000);
  assert.equal(promoDiscount(fixed, 300_000, "INR"), 300_000);
  assert.equal(promoDiscount(fixed, 21_000, "USD"), 5_000);
});

test("regression: an ordinary code is still upfront-only (the waiver is the only code that works on every plan)", () => {
  assert.ok(promoModeProblem("monthly"));
  assert.equal(promoModeProblem("upfront"), null);
});
