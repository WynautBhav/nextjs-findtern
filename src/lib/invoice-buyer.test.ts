import assert from "node:assert/strict";
import { test } from "node:test";

import { invoiceBuyerOf, invoiceBuyerPatch } from "./invoice-buyer.ts";
import { taxInvoiceHtml } from "./invoice.ts";
import { placeOfSupply } from "./gst.ts";

const karnataka = { companyName: "Acme", companyEmail: "a@acme.in", gstNumber: "29ABCDE1234F1Z5", city: "Bengaluru", state: "Karnataka", country: "India", billingPincode: "560001" };
const rajasthan = { ...karnataka, city: "Jaipur", state: "Rajasthan", billingPincode: "302001" };

const render = (buyer: ReturnType<typeof invoiceBuyerOf>) =>
  taxInvoiceHtml({
    invoiceNo: "FT/1",
    date: new Date("2026-10-20T06:00:00Z"),
    orderId: "order_x",
    currency: "INR",
    amountMinor: 1_000_000,
    description: "Placement",
    seller: { name: "Findtern Private Limited", address: "Jaipur", gstin: "08AAGCF2512F1Z0", email: "admin@findtern.in" },
    buyer: { ...buyer, place: placeOfSupply({ ...buyer, currency: "INR" }) },
  });

test("P1-1: the snapshot wins over a later edit of state, so the tax split does not change", () => {
  const raw = { ...invoiceBuyerPatch(karnataka), promo: null };
  const before = render(invoiceBuyerOf(raw, karnataka));
  const after = render(invoiceBuyerOf(raw, rajasthan));
  assert.equal(before, after);
  assert.match(after, /Karnataka/);
  assert.doesNotMatch(after, /Rajasthan/);
  const live = render(invoiceBuyerOf({}, rajasthan));
  assert.match(live, /Rajasthan/);
  assert.notEqual(live, after);
});

test("P1-1: no snapshot falls back to the live profile; null raw is safe", () => {
  assert.equal(invoiceBuyerOf(null, rajasthan).state, "Rajasthan");
  assert.equal(invoiceBuyerOf({ other: 1 }, null).name, "Customer");
});
