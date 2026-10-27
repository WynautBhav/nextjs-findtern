import assert from "node:assert/strict";
import { test } from "node:test";

import {
  displayInvoiceNumber,
  filterInvoiceRows,
  hasTaxInvoice,
  inDateRange,
  invoiceFilters,
  promoCodeOptions,
  sortInvoiceRows,
  type AdminInvoiceRow,
} from "./invoice-rows.ts";

const row = (over: Partial<AdminInvoiceRow>): AdminInvoiceRow => ({
  id: "abcdef12-0000",
  orderId: "order_1",
  amountMinor: 249900,
  currency: "INR",
  status: "paid",
  paidAt: "2026-08-01T10:00:00.000Z",
  createdAt: "2026-08-01T09:00:00.000Z",
  partyId: "u1",
  partyName: "Asha K",
  partyEmail: "asha@example.com",
  buyer: { name: "Asha K" },
  ...over,
});

const none = invoiceFilters({});

test("tax invoice only for paid rows with money (ADM-06)", () => {
  assert.equal(hasTaxInvoice(row({})), true);
  assert.equal(hasTaxInvoice(row({ status: "created" })), false);
  assert.equal(hasTaxInvoice(row({ status: "failed" })), false);
  assert.equal(hasTaxInvoice(row({ amountMinor: 0 })), false);
  assert.equal(displayInvoiceNumber(row({ status: "created" }), "FT-INT"), null);
  assert.equal(displayInvoiceNumber(row({}), "FT-INT"), "FT-INT-ABCDEF12");
  assert.equal(displayInvoiceNumber(row({ invoiceNumber: "FT/2026-27/0007" }), "FT-INT"), "FT/2026-27/0007");
});

test("search matches invoice number and interns (ADM-03, ADM-11)", () => {
  const rows = [row({ id: "r1", invoiceNumber: "FT/2026-27/0007" }), row({ id: "r2", interns: "Ravi M; Neha S" })];
  assert.deepEqual(filterInvoiceRows(rows, invoiceFilters({ q: "0007" }), "INV").map((r) => r.id), ["r1"]);
  assert.deepEqual(filterInvoiceRows(rows, invoiceFilters({ q: "neha" }), "INV").map((r) => r.id), ["r2"]);
});

test("promo applied / per-code filters count legacy discounts (ADM-02, ADM-12)", () => {
  const rows = [
    row({ id: "a", promoCode: "CAMPUS99", discountMinor: 247401 }),
    row({ id: "b", promoCode: null, discountMinor: 50000 }),
    row({ id: "c" }),
  ];
  assert.deepEqual(filterInvoiceRows(rows, invoiceFilters({ promo: "with" }), "X").map((r) => r.id), ["a", "b"]);
  assert.deepEqual(filterInvoiceRows(rows, invoiceFilters({ promo: "without" }), "X").map((r) => r.id), ["c"]);
  assert.deepEqual(filterInvoiceRows(rows, invoiceFilters({ code: "campus99" }), "X").map((r) => r.id), ["a"]);
  assert.deepEqual(promoCodeOptions([...rows, row({ promoCode: "campus99" })]), ["CAMPUS99"]);
});

test("status 'paid' includes captured; dates are inclusive in India time", () => {
  const rows = [row({ id: "p", status: "captured" }), row({ id: "c", status: "created" })];
  assert.deepEqual(filterInvoiceRows(rows, invoiceFilters({ status: "paid" }), "X").map((r) => r.id), ["p"]);
  // 20:00 UTC on 31 Jul is 1 Aug in India.
  assert.equal(inDateRange("2026-07-31T20:00:00.000Z", "2026-08-01", "2026-08-01"), true);
  assert.equal(inDateRange("2026-07-31T10:00:00.000Z", "2026-08-01", ""), false);
  assert.equal(inDateRange(null, "", ""), true);
  assert.deepEqual(filterInvoiceRows([row({})], none, "X").length, 1);
  assert.equal(invoiceFilters({ from: "01/08/2026" }).from, "");
});

test("sorting by amount and date", () => {
  const rows = [row({ id: "s", amountMinor: 100 }), row({ id: "l", amountMinor: 900, paidAt: "2026-09-01T00:00:00.000Z" })];
  assert.deepEqual(sortInvoiceRows(rows, "amount", "desc").map((r) => r.id), ["l", "s"]);
  assert.deepEqual(sortInvoiceRows(rows, "date", "asc").map((r) => r.id), ["s", "l"]);
});
