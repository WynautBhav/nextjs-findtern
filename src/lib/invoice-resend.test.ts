import assert from "node:assert/strict";
import { test } from "node:test";

import { resendInvoiceRefusal } from "./invoice-resend.ts";

test("an invoice can be resent for a paid order with money and an invoice number", () => {
  assert.equal(resendInvoiceRefusal({ status: "paid", amountMinor: 1000, invoiceNumber: "171126-01" }), null);
});

test("refunded orders keep their invoice, so it can still be resent", () => {
  assert.equal(resendInvoiceRefusal({ status: "partially_refunded", amountMinor: 1000, invoiceNumber: "171126-01" }), null);
  assert.equal(resendInvoiceRefusal({ status: "refunded", amountMinor: 1000, invoiceNumber: "171126-01" }), null);
});

test("unpaid, failed, free and numberless orders have no tax invoice to send", () => {
  assert.match(resendInvoiceRefusal({ status: "created", amountMinor: 1000, invoiceNumber: null })!, /not paid|no tax invoice/i);
  assert.match(resendInvoiceRefusal({ status: "failed", amountMinor: 1000, invoiceNumber: null })!, /no tax invoice/i);
  assert.match(resendInvoiceRefusal({ status: "paid", amountMinor: 0, invoiceNumber: null })!, /no tax invoice/i);
  assert.match(resendInvoiceRefusal({ status: "paid", amountMinor: 1000, invoiceNumber: null })!, /no invoice number/i);
});
