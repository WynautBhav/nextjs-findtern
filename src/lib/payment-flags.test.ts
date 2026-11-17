import assert from "node:assert/strict";
import test from "node:test";

import { orderReview, paidAmountProblem, planAmountMismatch, planDuplicatePayment } from "./payment-flags.ts";

const stored = { amountMinor: 3_520_000, currency: "INR" };
const AT = new Date("2026-11-17T10:00:00Z");

test("paidAmountProblem: the exact amount and currency Razorpay says was paid is fine", () => {
  assert.equal(paidAmountProblem(stored, { amountMinor: 3_520_000, currency: "INR" }), null);
  assert.equal(paidAmountProblem(stored, { amountMinor: 3_520_000, currency: "inr" }), null);
});

test("paidAmountProblem: one paisa less or more is refused", () => {
  const less = paidAmountProblem(stored, { amountMinor: 3_519_999, currency: "INR" });
  assert.equal(less?.reason, "amount_mismatch");
  assert.equal(less?.expectedMinor, 3_520_000);
  assert.equal(less?.paidMinor, 3_519_999);
  assert.equal(paidAmountProblem(stored, { amountMinor: 3_520_001, currency: "INR" })?.reason, "amount_mismatch");
});

test("paidAmountProblem: a payment in another currency is refused even when the number matches", () => {
  const p = paidAmountProblem(stored, { amountMinor: 3_520_000, currency: "USD" });
  assert.equal(p?.reason, "currency_mismatch");
  assert.equal(p?.paidCurrency, "USD");
});

test("paidAmountProblem: a signed event that states no amount (or a non-integer) is refused, not trusted", () => {
  assert.equal(paidAmountProblem(stored, {})?.reason, "amount_missing");
  assert.equal(paidAmountProblem(stored, { amountMinor: "3520000", currency: "INR" })?.reason, "amount_missing");
  assert.equal(paidAmountProblem(stored, { amountMinor: 35200.5, currency: "INR" })?.reason, "amount_missing");
  assert.equal(paidAmountProblem(stored, { amountMinor: 3_520_000 })?.reason, "currency_mismatch");
});

test("planAmountMismatch: records the refused payment once; a replay of the same event changes nothing", () => {
  const problem = paidAmountProblem(stored, { amountMinor: 100, currency: "INR" })!;
  const first = planAmountMismatch({ notes: { x: 1 } }, "pay_1", problem, AT);
  assert.ok(first);
  const list = (first!.raw as { amountMismatches: { paymentId: string; paidMinor: number; expectedMinor: number }[] }).amountMismatches;
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].paymentId, list[0].paidMinor, list[0].expectedMinor], ["pay_1", 100, 3_520_000]);
  assert.deepEqual((first!.raw as { notes: unknown }).notes, { x: 1 }, "the rest of raw is kept");
  assert.equal(planAmountMismatch(first!.raw, "pay_1", problem, AT), null);
  const second = planAmountMismatch(first!.raw, "pay_2", problem, AT);
  assert.equal((second!.raw as { amountMismatches: unknown[] }).amountMismatches.length, 2);
});

test("planDuplicatePayment: a different payment id on an order that is already paid is flagged for refund", () => {
  const plan = planDuplicatePayment({ status: "paid", paymentId: "pay_1", raw: {} }, "pay_2", { amountMinor: 3_520_000, currency: "INR" }, AT);
  assert.ok(plan);
  const dups = (plan!.raw as { duplicatePayments: { paymentId: string; amountMinor: number | null }[] }).duplicatePayments;
  assert.deepEqual([dups[0].paymentId, dups[0].amountMinor], ["pay_2", 3_520_000]);
});

test("planDuplicatePayment: the same payment again (order.paid after payment.captured, a replay) is not a duplicate", () => {
  assert.equal(planDuplicatePayment({ status: "paid", paymentId: "pay_1", raw: {} }, "pay_1", {}, AT), null);
});

test("planDuplicatePayment: flagged once per payment id; an unpaid order is never a duplicate", () => {
  const first = planDuplicatePayment({ status: "paid", paymentId: "pay_1", raw: {} }, "pay_2", {}, AT)!;
  assert.equal(planDuplicatePayment({ status: "paid", paymentId: "pay_1", raw: first.raw }, "pay_2", {}, AT), null);
  assert.equal(planDuplicatePayment({ status: "created", paymentId: null, raw: {} }, "pay_2", {}, AT), null);
  assert.equal(planDuplicatePayment({ status: "failed", paymentId: null, raw: {} }, "pay_2", {}, AT), null);
});

test("planDuplicatePayment: an order paid with no gateway payment id on file (free, manual) is not compared", () => {
  assert.equal(planDuplicatePayment({ status: "paid", paymentId: null, raw: {} }, "pay_2", {}, AT), null);
});

test("orderReview: lists every reason an order needs accounts to look at it", () => {
  assert.deepEqual(orderReview({}), { flagged: false, reasons: [] });
  assert.deepEqual(orderReview(null), { flagged: false, reasons: [] });
  const r = orderReview({
    needsReview: { reason: "not_all_hired" },
    duplicatePayments: [{ paymentId: "pay_2" }],
    amountMismatches: [{ paymentId: "pay_3" }],
  });
  assert.equal(r.flagged, true);
  assert.deepEqual(r.reasons.map((x) => x.code), ["not_all_hired", "duplicate_payment", "amount_mismatch"]);
  assert.match(r.reasons[1].label, /refund/i);
  assert.equal(orderReview({ needsReview: { reason: "month_mismatch" } }).reasons[0].code, "month_mismatch");
});
