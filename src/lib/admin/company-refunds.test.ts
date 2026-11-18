import assert from "node:assert/strict";
import { test } from "node:test";

import { companyRefundRows, type CompanyRefundOrder } from "./company-refunds.ts";

const order = (over: Partial<CompanyRefundOrder>): CompanyRefundOrder => ({
  id: "p1", orderId: "order_1", employerId: "e1", companyName: "Acme", invoiceNumber: "INV-1", status: "paid",
  amountMinor: 118000, currency: "INR", paidAt: new Date("2026-10-01T05:00:00Z"), createdAt: new Date("2026-10-01T04:00:00Z"), raw: {}, ...over,
});

test("an order with no refund gives no rows", () => {
  assert.deepEqual(companyRefundRows([order({})]), []);
});

test("a processed INR refund with no credit note is flagged, GST split inside the amount", () => {
  const rows = companyRefundRows([order({ raw: { refunds: [{ id: "r1", amountMinor: 59000, status: "processed", at: "2026-10-05T00:00:00Z" }] } })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amountMinor, 59000);
  assert.equal(rows[0].gstMinor, 9000);
  assert.equal(rows[0].creditNoteNeeded, true);
});

test("a recorded credit note clears the flag", () => {
  const [r] = companyRefundRows([order({ raw: { refunds: [{ id: "r1", amountMinor: 59000, status: "processed", creditNote: "CN-7" }] } })]);
  assert.equal(r.creditNote, "CN-7");
  assert.equal(r.creditNoteNeeded, false);
});

test("a dollar refund carries no GST so needs no credit note", () => {
  const [r] = companyRefundRows([order({ currency: "USD", amountMinor: 29900, raw: { refunds: [{ id: "r1", amountMinor: 29900, status: "processed" }] } })]);
  assert.equal(r.gstMinor, 0);
  assert.equal(r.creditNoteNeeded, false);
});

test("a refund still pending at the gateway is not listed", () => {
  assert.deepEqual(companyRefundRows([order({ raw: { refunds: [{ id: "r1", amountMinor: 59000, status: "created" }] } })]), []);
});

test("an order labelled refunded with no amount counts the whole order, flagged as not recorded", () => {
  const [r] = companyRefundRows([order({ status: "refunded" })]);
  assert.equal(r.amountMinor, 118000);
  assert.equal(r.amountNotRecorded, true);
  assert.equal(r.creditNoteNeeded, true);
});

test("owed credit notes sort first, oldest on top", () => {
  const rows = companyRefundRows([
    order({ id: "a", raw: { refunds: [{ id: "x", amountMinor: 1000, status: "processed", at: "2026-10-09T00:00:00Z" }] } }),
    order({ id: "b", raw: { refunds: [{ id: "y", amountMinor: 1000, status: "processed", at: "2026-10-02T00:00:00Z" }] } }),
    order({ id: "c", raw: { refunds: [{ id: "z", amountMinor: 1000, status: "processed", at: "2026-10-01T00:00:00Z", creditNote: "CN-1" }] } }),
  ]);
  assert.deepEqual(rows.map((r) => r.rowId), ["b", "a", "c"]);
});
