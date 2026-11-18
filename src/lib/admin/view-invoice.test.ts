import assert from "node:assert/strict";
import { test } from "node:test";

import { viewInvoice } from "./view-invoice.ts";

const r = (over: Record<string, unknown> = {}) => ({ kind: "employer" as const, status: "paid", amountMinor: 100, invoiceNumber: "021126-1", orderId: "order_1", ...over });

test("paid with an invoice number links to the ledger row", () => {
  assert.deepEqual(viewInvoice(r()), { href: "/admin/orders?q=order_1", reason: null });
  assert.equal(viewInvoice(r({ kind: "intern", orderId: "o 2" })).href, "/admin/intern-invoices?q=o%202");
  assert.ok(viewInvoice(r({ status: "partially_refunded" })).href);
});

test("not received, zero, or no number: disabled with a reason", () => {
  for (const status of ["created", "failed", "pending", "cancelled"]) assert.match(viewInvoice(r({ status })).reason ?? "", /not received/);
  assert.match(viewInvoice(r({ amountMinor: 0 })).reason ?? "", /nothing was charged/);
  assert.match(viewInvoice(r({ invoiceNumber: null })).reason ?? "", /invoice number/);
  assert.equal(viewInvoice(r({ invoiceNumber: "  " })).href, null);
});
