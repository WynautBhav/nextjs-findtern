import assert from "node:assert/strict";
import { test } from "node:test";

import { internInvoiceSummary, invoiceOrder } from "./invoice-summary.ts";
import type { AdminInvoiceRow } from "./invoice-rows.ts";

const row = (o: Partial<AdminInvoiceRow>): AdminInvoiceRow => ({
  id: "r" + Math.random(),
  orderId: "o",
  amountMinor: 249900,
  currency: "INR",
  status: "paid",
  createdAt: "2026-11-10T00:00:00Z",
  partyId: "p",
  partyName: "A B",
  partyEmail: "a@b.c",
  buyer: { name: "A B" },
  gateway: "razorpay",
  ...o,
});

test("collected is the sum of every paid row; invoices are the paid rows with money", () => {
  const s = internInvoiceSummary([
    row({}),
    row({ amountMinor: 199920, discountMinor: 49980, promoCode: "WELCOME20" }),
    row({ amountMinor: 0, gateway: "free", discountMinor: 249900, promoCode: "EARLYBIRD" }),
    row({ status: "created" }),
    row({ status: "failed" }),
    row({ flagOnly: true, amountMinor: 249900 }),
  ]);
  assert.equal(s.collectedMinor, 249900 + 199920);
  assert.equal(s.invoiceCount, 2);
  assert.equal(s.freeCount, 1);
  assert.equal(s.discountMinor, 49980 + 249900);
  assert.equal(s.notCollectedMinor, 2 * 249900);
  assert.equal(s.notCollectedCount, 2);
  assert.equal(s.markedPaidCount, 1);
});

test("a full-waiver row is neither an invoice nor money received", () => {
  const s = internInvoiceSummary([row({ amountMinor: 0, gateway: "promo_full_waiver", waivedMinor: 249900 })]);
  assert.equal(s.collectedMinor, 0);
  assert.equal(s.invoiceCount, 0);
  assert.equal(s.freeCount, 0);
  assert.equal(s.waivedCount, 1);
});

test("no rows is all zero", () => {
  const s = internInvoiceSummary([]);
  assert.deepEqual([s.collectedMinor, s.invoiceCount, s.freeCount, s.discountMinor, s.notCollectedMinor], [0, 0, 0, 0, 0]);
});

test("order reads the new param, the old sort and dir, and falls back to newest", () => {
  assert.equal(invoiceOrder({ order: "highest" }), "highest");
  assert.equal(invoiceOrder({ order: "bogus" }), "newest");
  assert.equal(invoiceOrder({ sort: "amount", dir: "asc" }), "lowest");
  assert.equal(invoiceOrder({ sort: "party" }), "newest");
  assert.equal(invoiceOrder({}), "newest");
});
