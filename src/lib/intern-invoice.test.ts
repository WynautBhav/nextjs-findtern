import { test } from "node:test";
import assert from "node:assert/strict";

import { adminInvoiceInput } from "./admin/invoice-print.ts";
import { activationRaw, internInvoiceNumbered, internInvoiceRow, isOwnInvoice, ownInternInvoices, zeroValueInvoiceEligible, type InternPaymentRecord } from "./intern-invoice.ts";
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

test("unpaid and number-less rows are absent; a ₹0 row with no code is absent", () => {
  const rows = [rec({ amountMinor: 0, raw: {} }), rec({ status: "created" }), rec({ invoiceNumber: null }), rec({ id: "keep" })];
  assert.deepEqual(ownInternInvoices(rows, "u1", seller).map((i) => i.id), ["keep"]);
});

test("B-54: a ₹0 activation made free by a promo code is listed with its number and discount", () => {
  const free = rec({ id: "free", amountMinor: 0, gateway: "free", raw: { promoCode: "QA-FREE", discountMinor: 249900 } });
  const [inv] = ownInternInvoices([free], "u1", seller);
  assert.equal(inv.id, "free");
  assert.equal(inv.amountMinor, 0);
  assert.match(inv.html, /QA-FREE/);
  assert.match(inv.html, /021126-124/);
});

test("B-54: a full-waiver ₹0 order is listed; test mode and college codes are not", () => {
  assert.equal(zeroValueInvoiceEligible({ promoCode: "FREE-AAAA-BBBB-CCCC", discountMinor: 249900 }), true);
  assert.equal(zeroValueInvoiceEligible({ promo: { promoCode: "X", discountMinor: 100 } }), true);
  assert.equal(zeroValueInvoiceEligible({ testMode: true }), false);
  assert.equal(zeroValueInvoiceEligible({ testMode: true, promoCode: "X", discountMinor: 100 }), false);
  assert.equal(zeroValueInvoiceEligible({ promoCode: "TPO", discountMinor: 100, collegePromo: true }), false);
  assert.equal(zeroValueInvoiceEligible({ method: "manual", reference: "r1" }), false, "an admin mark-paid with no code is not a promo");
  assert.equal(zeroValueInvoiceEligible(null), false);
  assert.equal(isOwnInvoice(rec({ amountMinor: 0, raw: { testMode: true } }), "u1"), false);
  assert.equal(isOwnInvoice(rec({ amountMinor: 0, raw: { promoCode: "X", discountMinor: 5 } }), "u2"), false, "still only the owner's");
});


test("B-54: settlement numbers a ₹0 intern row only through the eligibility rule (and promo college) the list uses", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./payments.ts", import.meta.url), "utf8");
  assert.match(src, /internInvoiceNumbered\(payment\.amountMinor, payment\.raw, collegeId\)\) await assignInvoiceNumber\("intern"/);
});

// R1: the normal activation route (not only the college redeem route) takes college codes; its raw must keep them out of the serial.
test("a 100% college code through the activation route takes no invoice serial", () => {
  const raw = activationRaw({ code: "IITX", collegeId: "col-1" }, 49900);
  assert.equal(raw.collegePromo, true);
  assert.equal(raw.declaredAdult, true);
  assert.equal(zeroValueInvoiceEligible(raw), false);
  assert.equal(internInvoiceNumbered(0, raw, "col-1"), false);
});

test("a row written before the flag existed is still kept out when the promo row names a college", () => {
  const legacyRaw = { promoCode: "IITX", discountMinor: 49900, declaredAdult: true };
  assert.equal(zeroValueInvoiceEligible(legacyRaw), true); // the raw alone cannot tell
  assert.equal(internInvoiceNumbered(0, legacyRaw, "col-1"), false);
});

test("an ordinary full-discount code and every paid order still take a serial", () => {
  const raw = activationRaw({ code: "FREE100", collegeId: null }, 49900);
  assert.equal(raw.collegePromo, undefined);
  assert.equal(internInvoiceNumbered(0, raw, null), true);
  assert.equal(internInvoiceNumbered(0, { testMode: true }, null), false);
  assert.equal(internInvoiceNumbered(0, {}, null), false);
  assert.equal(internInvoiceNumbered(249900, {}, null), true);
  assert.equal(internInvoiceNumbered(24900, activationRaw({ code: "IITX", collegeId: "col-1" }, 225000), "col-1"), true);
});
