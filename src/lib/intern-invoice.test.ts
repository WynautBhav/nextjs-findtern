import { test } from "node:test";
import assert from "node:assert/strict";

import { adminInvoiceInput } from "./admin/invoice-print.ts";
import { internInvoiceRow, isOwnInvoice, ownInternInvoices, type InternPaymentRecord } from "./intern-invoice.ts";
import { taxInvoiceHtml, type InvoiceSeller } from "./invoice.ts";

const seller: InvoiceSeller = { name: "Findtern", gstin: "29ABCDE1234F1Z5", address: "Bengaluru", email: "a@b.c" };
const rec = (o: Partial<InternPaymentRecord> = {}): InternPaymentRecord => ({
  id: "11111111-aaaa", invoiceNumber: "021126-124", internId: "u1", orderId: "order_ABCDEFGH12", paymentId: "pay_1", gateway: "razorpay",
  amountMinor: 249900, currency: "INR", status: "paid", paidAt: new Date("2026-11-02T05:00:00Z"), createdAt: new Date("2026-11-02T04:00:00Z"),
  raw: { promoCode: "SAVE10", discountMinor: 24900 }, onboardingPayment: null, firstName: "Asha", lastName: "Rao", email: "a@x.in", pinCode: "560001", state: "Karnataka", ...o,
});

test("the intern copy is byte-identical to the admin print of the same row", () => {
  const r = rec();
  const [mine] = ownInternInvoices([r], "u1", seller);
  assert.equal(mine.html, taxInvoiceHtml(adminInvoiceInput(internInvoiceRow(r), "intern", seller)));
  assert.match(mine.html, /021126-124/);
});

test("another intern's invoice is unreachable", () => {
  assert.deepEqual(ownInternInvoices([rec({ internId: "u2" })], "u1", seller), []);
  assert.equal(isOwnInvoice(rec({ internId: "u2" }), "u1"), false);
});

test("₹0, unpaid and number-less rows are absent", () => {
  const rows = [rec({ amountMinor: 0 }), rec({ status: "created" }), rec({ invoiceNumber: null }), rec({ id: "keep" })];
  assert.deepEqual(ownInternInvoices(rows, "u1", seller).map((i) => i.id), ["keep"]);
});
