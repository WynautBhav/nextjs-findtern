import assert from "node:assert/strict";
import test from "node:test";

import { isSettledStatus, orderRefunds, planRefundRecord, refundGstMinor, settledOrders } from "./refund-accounting.ts";

const ord = (over: Record<string, unknown> = {}) => ({
  id: "o1", status: "paid", amountMinor: 2_900_000, currency: "INR", paidAt: new Date("2026-11-21T10:00:00Z"),
  raw: { notes: { proposalIds: ["h1"], paymentMode: "total" } } as Record<string, unknown>, ...over,
});
const withRefunds = (refunds: unknown[], over: Record<string, unknown> = {}) => ord({ raw: { notes: { proposalIds: ["h1"], paymentMode: "total" }, refunds }, ...over });

test("paid order with no refund: nothing refunded, net = paid", () => {
  const v = orderRefunds(ord());
  assert.deepEqual([v.paidMinor, v.refundedMinor, v.netMinor, v.status], [2_900_000, 0, 2_900_000, "paid"]);
});

test("a partial refund keeps paid as recorded and shows refunded separately", () => {
  const v = orderRefunds(withRefunds([{ id: "rfnd_1", amountMinor: 1_000_000, status: "processed" }], { status: "paid" }));
  assert.deepEqual([v.paidMinor, v.refundedMinor, v.netMinor, v.status], [2_900_000, 1_000_000, 1_900_000, "partially_refunded"]);
});

test("status is derived from the amounts: a full amount is 'refunded' even when the label still says paid", () => {
  const v = orderRefunds(withRefunds([{ id: "rfnd_1", amountMinor: 2_900_000, status: "processed" }]));
  assert.equal(v.status, "refunded");
  assert.equal(v.netMinor, 0);
});

test("a label cannot overrule recorded amounts: 'refunded' label with a partial amount is partially_refunded", () => {
  const v = orderRefunds(withRefunds([{ id: "rfnd_1", amountMinor: 100_000, status: "processed" }], { status: "refunded" }));
  assert.equal(v.status, "partially_refunded");
  assert.equal(v.refundedMinor, 100_000);
});

test("label only: 'refunded' with no amounts recorded counts the whole order, flagged as unverified", () => {
  const v = orderRefunds(ord({ status: "refunded" }));
  assert.deepEqual([v.refundedMinor, v.status, v.labelOnly], [2_900_000, "refunded", true]);
  const p = orderRefunds(ord({ status: "partially_refunded" }));
  assert.deepEqual([p.refundedMinor, p.status, p.labelOnly], [0, "partially_refunded", true]);
});

test("refunds that are pending or failed at the gateway are not money back yet", () => {
  const v = orderRefunds(withRefunds([{ id: "a", amountMinor: 500_000, status: "pending" }, { id: "b", amountMinor: 500_000, status: "failed" }]));
  assert.equal(v.refundedMinor, 0);
  assert.equal(v.status, "paid");
});

test("the same gateway refund id listed twice counts once", () => {
  const v = orderRefunds(withRefunds([{ id: "rfnd_1", amountMinor: 700_000, status: "processed" }, { id: "rfnd_1", amountMinor: 700_000, status: "processed" }]));
  assert.equal(v.refundedMinor, 700_000);
});

test("refunded can never exceed paid: the view caps it and flags the order", () => {
  const v = orderRefunds(withRefunds([{ id: "a", amountMinor: 2_000_000, status: "processed" }, { id: "b", amountMinor: 2_000_000, status: "processed" }]));
  assert.deepEqual([v.refundedMinor, v.netMinor, v.overRefunded], [2_900_000, 0, true]);
});

test("USD orders are refunded in USD", () => {
  const v = orderRefunds(withRefunds([{ id: "a", amountMinor: 10_000, status: "processed" }], { amountMinor: 35_000, currency: "USD" }));
  assert.deepEqual([v.currency, v.refundedMinor, v.netMinor], ["USD", 10_000, 25_000]);
});

test("only paid, refunded and partially_refunded rows are settled", () => {
  for (const s of ["paid", "refunded", "partially_refunded", "PAID"]) assert.ok(isSettledStatus(s), s);
  for (const s of ["created", "failed", "cancelled", ""]) assert.ok(!isSettledStatus(s), s);
});

test("settledOrders: a refunded order still counts as paid coverage, so the company does not owe it again", () => {
  const out = settledOrders([ord({ status: "refunded" })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].status, "paid");
});

test("settledOrders: a fully refunded order later paid again by a new order is counted once", () => {
  const first = ord({ id: "o1", status: "refunded" });
  const again = ord({ id: "o2", status: "paid", paidAt: new Date("2026-11-25T10:00:00Z") });
  assert.deepEqual(settledOrders([first, again]).map((o) => o.id), ["o2"]);
});

test("settledOrders: a partially refunded order is never dropped, even when a later order covers the same hire", () => {
  const first = withRefunds([{ id: "a", amountMinor: 1, status: "processed" }]);
  const again = ord({ id: "o2", paidAt: new Date("2026-11-25T10:00:00Z") });
  assert.deepEqual(settledOrders([first, again]).map((o) => o.id), ["o1", "o2"]);
});

test("settledOrders: no refunded rows means the same orders, untouched", () => {
  const rows = [ord(), ord({ id: "o2", status: "failed" })];
  const out = settledOrders(rows);
  assert.deepEqual(out, [rows[0]]);
  assert.equal(out[0], rows[0]);
});

test("recording a refund event: first time is stored, a replay changes nothing", () => {
  const entity = { id: "rfnd_1", amount: 1_000_000, status: "processed", created_at: 1_790_000_000 };
  const a = planRefundRecord(ord(), entity);
  assert.equal(a.kind, "recorded");
  assert.ok(a.kind === "recorded");
  const after = ord({ raw: a.raw });
  assert.equal(orderRefunds(after).refundedMinor, 1_000_000);
  const b = planRefundRecord(after, entity);
  assert.equal(b.kind, "duplicate");
  assert.equal(orderRefunds(ord({ raw: (b as { raw?: Record<string, unknown> }).raw ?? after.raw })).refundedMinor, 1_000_000);
});

test("recording a refund event: more than the paid amount is rejected, not stored", () => {
  const a = planRefundRecord(ord({ amountMinor: 1_000_000 }), { id: "rfnd_1", amount: 1_000_001, status: "processed" });
  assert.equal(a.kind, "over_paid");
  const prior = withRefunds([{ id: "rfnd_0", amountMinor: 600_000, status: "processed" }], { amountMinor: 1_000_000 });
  assert.equal(planRefundRecord(prior, { id: "rfnd_1", amount: 500_000, status: "processed" }).kind, "over_paid");
  assert.equal(planRefundRecord(prior, { id: "rfnd_1", amount: 400_000, status: "processed" }).kind, "recorded");
});

test("recording a refund event: failed, pending and nonsense events are ignored", () => {
  assert.equal(planRefundRecord(ord(), { id: "r", amount: 100, status: "failed" }).kind, "ignored");
  assert.equal(planRefundRecord(ord(), { id: "r", amount: 100, status: "pending" }).kind, "ignored");
  assert.equal(planRefundRecord(ord(), { id: "r", amount: 0, status: "processed" }).kind, "ignored");
  assert.equal(planRefundRecord(ord(), { id: "", amount: 100, status: "processed" }).kind, "ignored");
  assert.equal(planRefundRecord(ord({ status: "created" }), { id: "r", amount: 100, status: "processed" }).kind, "ignored");
});

test("refund GST: the inclusive 18% split of the refunded amount, same rounding as a payment; none on USD", () => {
  assert.equal(refundGstMinor(2_900_000, "INR"), 2_900_000 - Math.round(2_900_000 / 1.18));
  assert.equal(refundGstMinor(800_000, "INR"), 122_034);
  assert.equal(refundGstMinor(10_000, "USD"), 0);
  assert.equal(refundGstMinor(0, "INR"), 0);
});
