import assert from "node:assert/strict";
import test from "node:test";

import { WAIVER_GATEWAY } from "../full-waiver.ts";
import { gatewayLabel, isWaivedRow } from "./invoice-rows.ts";
import { computeReceivables, waivedTotals, type ReceivablesInput } from "./receivables.ts";
import { isMoneyReceived, ledgerTotals } from "./revenue.ts";

const paid = { id: "p1", status: "paid", amountMinor: 3_520_000, currency: "INR", discountMinor: 0, refundedMinor: 0, gateway: "razorpay" };
const waived = { id: "w1", status: "paid", amountMinor: 0, currency: "INR", discountMinor: 3_520_000, refundedMinor: 0, gateway: WAIVER_GATEWAY, waivedMinor: 3_520_000 };

test("a waived order is not money received", () => {
  assert.equal(isMoneyReceived({ gateway: WAIVER_GATEWAY }), false);
  assert.equal(isMoneyReceived({ gateway: "razorpay" }), true);
  assert.equal(isMoneyReceived({ gateway: "free" }), true, "the old zero-amount free rows are untouched");
});

test("ledger totals: the waived order adds nothing to collected, its count or the discount total, and shows as Waived", () => {
  const without = ledgerTotals([paid]);
  const withWaiver = ledgerTotals([paid, waived]);
  assert.equal(withWaiver.collectedMinor, without.collectedMinor);
  assert.equal(withWaiver.collectedCount, without.collectedCount, "a waived order is not a paid order");
  assert.equal(withWaiver.discountMinor, without.discountMinor, "the waived value is not a discount given");
  assert.equal(withWaiver.waivedMinor, 3_520_000);
  assert.equal(withWaiver.waivedCount, 1);
  const { waivedMinor: _m, waivedCount: _c, ...rest } = withWaiver; // eslint-disable-line @typescript-eslint/no-unused-vars
  assert.deepEqual(rest, without, "everything else is exactly what the paid order alone gives");
  assert.equal(withWaiver.refundedMinor, 0);
});

test("ledger totals with ONLY waived orders: everything is 0, nothing is NaN", () => {
  const t = ledgerTotals([waived, { ...waived, id: "w2", currency: "USD", amountMinor: 0, waivedMinor: 44_000 }]);
  assert.equal(t.collectedMinor, 0);
  assert.equal(t.collectedCount, 0);
  assert.equal(t.netCollectedMinor, 0);
  assert.equal(t.waivedMinor, 3_520_000 + 44_000 * 100);
  assert.equal(Object.values(t).every((v) => Number.isFinite(v)), true);
});

test("a waived order that is not settled (failed, created) is not counted as waived", () => {
  assert.equal(ledgerTotals([{ ...waived, status: "failed" }]).waivedCount, undefined);
  assert.equal(ledgerTotals([{ ...waived, status: "created" }]).waivedCount, undefined);
});

test("ordinary rows are byte-identical with and without the new fields (regression)", () => {
  const rows = [paid, { ...paid, id: "p2", amountMinor: 440_000, currency: "USD", discountMinor: 5_000 }, { id: "u1", status: "created", amountMinor: 100, currency: "INR" }];
  const t = ledgerTotals(rows);
  assert.deepEqual(t, { collectedMinor: 3_520_000 + 44_000_000, collectedCount: 2, discountMinor: 500_000, notCollectedMinor: 100, notCollectedCount: 1, markedPaidCount: 0, refundedMinor: 0, netCollectedMinor: 47_520_000 });
  assert.equal("waivedCount" in t, false, "no waiver keys at all when no waived order exists");
});

test("labels: the gateway reads 'Complimentary (full waiver)'", () => {
  assert.equal(gatewayLabel(WAIVER_GATEWAY), "Complimentary (full waiver)");
  assert.equal(gatewayLabel("razorpay"), "Razorpay");
  assert.equal(isWaivedRow({ gateway: WAIVER_GATEWAY }), true);
  assert.equal(isWaivedRow({ gateway: "razorpay" }), false);
});

const at = new Date("2026-11-10T06:00:00Z");
const order = (over: Record<string, unknown>) => ({ id: "o", status: "paid", currency: "INR", at, raw: { promo: { fullWaiver: true, promoCodeId: "p", waivedMinor: 100_000 } }, ...over });

test("waivedTotals sums the list value in INR inside the window, settled orders only", () => {
  const all = () => true;
  assert.deepEqual(waivedTotals([order({}), order({ currency: "USD", raw: { promo: { fullWaiver: true, waivedMinor: 1_000 } } }), order({ status: "failed" })], all), { minor: 100_000 + 100_000, count: 2 });
  assert.deepEqual(waivedTotals([], all), { minor: 0, count: 0 });
  assert.deepEqual(waivedTotals([order({})], () => false), { minor: 0, count: 0 });
});

const base: ReceivablesInput = {
  since: null, until: null,
  employerName: () => "Acme", internName: () => "Asha", scoreOf: () => 0, activationFeeMinor: 49_900,
  proposals: [], employerPayments: [], internPayments: [], unpaidProfiles: [], payouts: [],
};

test("Money in/out: a waived employer order and a waived activation make no 'received' row, Received stays 0, Waived is reported, no NaN", () => {
  const out = computeReceivables(
    {
      ...base,
      employerPayments: [{ id: "e1", employerId: "emp", orderId: "waiver_1", gateway: WAIVER_GATEWAY, paymentId: "waiver_1", status: "paid", amountMinor: 0, currency: "INR", paidAt: at, createdAt: at, raw: { promo: { fullWaiver: true, promoCodeId: "p", waivedMinor: 3_520_000 } } }],
      waivedOrders: [{ id: "e1", status: "paid", currency: "INR", at, raw: { promo: { fullWaiver: true, promoCodeId: "p", waivedMinor: 3_520_000 } } }],
    },
    { receivables: "both", payables: "both" },
  );
  assert.equal(out.receivables.filter((r) => r.status === "received").length, 0);
  assert.equal(out.totals.receivedMinor, 0);
  assert.deepEqual(out.waived, { minor: 3_520_000, count: 1 });
  assert.equal(out.refundTotals.netReceivedMinor, 0);
});

test("Money in/out: a normal paid order still yields its 'received' row (regression)", () => {
  const out = computeReceivables(
    { ...base, employerPayments: [{ id: "e2", employerId: "emp", orderId: "order_1", gateway: "razorpay", paymentId: "pay_1", status: "paid", amountMinor: 3_520_000, currency: "INR", paidAt: at, createdAt: at, raw: {} }] },
    { receivables: "both", payables: "both" },
  );
  assert.equal(out.totals.receivedMinor, 3_520_000);
  assert.equal("waived" in out, false, "the report is unchanged when no waived order exists");
});
