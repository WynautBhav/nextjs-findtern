import assert from "node:assert/strict";
import { test } from "node:test";

import { displayInvoiceNumber, formatInvoiceNumber, legacyInvoiceNumber, lineRows, taxInvoiceHtml } from "./invoice.ts";
import { placeOfSupply } from "./gst.ts";

const paid = [
  { orderId: "order_b", paidAt: "2026-10-20T06:00:00Z" }, // 11:30 IST
  { orderId: "order_a", paidAt: "2026-10-20T06:00:00Z" }, // same instant: order id breaks the tie
  { orderId: "order_c", paidAt: "2026-10-20T20:00:00Z" }, // 01:30 IST on the 21st
  { orderId: "order_d", paidAt: "2026-10-20T04:00:00Z" }, // 09:30 IST
];

test("EMH-09: legacy number is DDMMYY-NN by paid time among that day's employer payments (IST)", () => {
  assert.equal(legacyInvoiceNumber(paid[3], paid), "201026-01");
  assert.equal(legacyInvoiceNumber(paid[1], paid), "201026-02");
  assert.equal(legacyInvoiceNumber(paid[0], paid), "201026-03");
  assert.equal(legacyInvoiceNumber(paid[2], paid), "211026-01");
});

test("EMH-09: payments invoiced by legacy keep their legacy number; new ones keep FT/…", () => {
  const legacyRow = { id: "11111111-aaaa", invoiceNumber: "FT/2026-27/0001", ...paid[3] };
  assert.equal(displayInvoiceNumber(legacyRow, paid), "201026-01");
  const newRow = { id: "22222222-bbbb", orderId: "order_new", paidAt: "2026-11-02T06:00:00Z", invoiceNumber: "FT/2026-27/0007" };
  assert.equal(displayInvoiceNumber(newRow, [...paid, newRow]), "FT/2026-27/0007");
  // Settled by legacy after a rollback: no stored number, so the legacy one.
  const rollback = { id: "33333333-cccc", orderId: "order_rb", paidAt: "2026-11-03T06:00:00Z", invoiceNumber: null };
  assert.equal(displayInvoiceNumber(rollback, [rollback]), "031126-01");
});

test("EMH-08: one row per hire, each at its own GST-inclusive price that adds up to the order's", () => {
  const rows = lineRows(
    [
      { label: "A - Intern", amountMinor: 100_000 },
      { label: "B - Intern", amountMinor: 200_000 },
    ],
    300_000,
  );
  assert.deepEqual(rows.map((r) => r.priceMinor), [100_000, 200_000]);
  // Prices that don't add up to what was paid aren't split.
  const promo = lineRows([{ label: "A", amountMinor: 100_000 }, { label: "B", amountMinor: 100_000 }], 150_000);
  assert.deepEqual(promo.map((r) => r.priceMinor), [null, null]);
  // One line is the whole order.
  assert.deepEqual(lineRows([{ label: "A", amountMinor: null }], 500_000).map((r) => r.priceMinor), [500_000]);
});

test("the invoice follows the reference PDF: header band, dd-mm-yy date, Taxable value / CGST / SGST / Total, bank footer", () => {
  const html = taxInvoiceHtml({
    invoiceNo: "141026-01",
    date: new Date("2026-10-14T06:00:00Z"),
    orderId: "order_x",
    currency: "INR",
    amountMinor: 500_000,
    description: "Hiring services",
    lines: [{ label: "Abhinav Parashar \u2014 Marketing Intern", detail: "2m", amountMinor: 500_000 }],
    seller: {
      name: "Findtern Private Limited",
      address: "386, Jagatpura, Jaipur, Rajasthan (302017)",
      gstin: "08AAGCF2512F1Z0",
      email: "admin@findtern.in",
      bank: { accountName: "Findtern Private Limited", bankName: "Kotak Mahindra Bank", accountNumber: "5949973545", ifsc: "KKBK0003572" },
    },
    buyer: { name: "Test Account", email: "abhinav@findtern.in", place: { kind: "india", stateCode: "08", stateName: "Rajasthan" } },
  });
  assert.match(html, />INVOICE</);
  assert.match(html, /Invoice Date :<\/div>\s*<div class="v">14-10-26</);
  assert.match(html, /Invoice Number :<\/div>\s*<div class="v">141026-01</);
  assert.match(html, /Invoice to :/);
  assert.match(html, /GST: 08AAGCF2512F1Z0/);
  assert.match(html, /Item description/);
  assert.match(html, /Price \(INR\)/);
  assert.match(html, /Abhinav Parashar \u2014 Marketing Intern/);
  assert.match(html, /Taxable value<\/span><span>₹\s?4,237\.29/);
  assert.match(html, /CGST 9%<\/span><span>₹\s?381\.36/);
  assert.match(html, /SGST 9%<\/span><span>₹\s?381\.35/);
  assert.match(html, /Total<\/span><span>₹\s?5,000\.00/);
  assert.match(html, /Bank Account No: 5949973545/);
  assert.match(html, /Bank Name: Kotak Mahindra Bank/);
  assert.match(html, /IFSC: KKBK0003572/);
  assert.match(html, /admin@findtern\.in/);
});

test("a promo is noted under the totals and never changes the arithmetic rows", () => {
  const html = taxInvoiceHtml({
    invoiceNo: "141026-02",
    date: new Date("2026-10-14T06:00:00Z"),
    orderId: "order_p",
    currency: "INR",
    amountMinor: 400_000,
    description: "Hiring services",
    promo: { code: "WELCOME", discountMinor: 100_000 },
    seller: { name: "Findtern Private Limited", address: "Jaipur", gstin: "08AAGCF2512F1Z0", email: "admin@findtern.in" },
    buyer: { name: "Acme", place: { kind: "india", stateCode: "08", stateName: "Rajasthan" } },
  });
  assert.match(html, /Promo WELCOME applied: you saved ₹\s?1,000\.00/);
  assert.match(html, /Total<\/span><span>₹\s?4,000\.00/);
});

test("EMH-08: invoice prints the per-line label, the full-time wording and the bank block", () => {
  const html = taxInvoiceHtml({
    invoiceNo: "FT/2026-27/0001",
    date: new Date("2026-11-02T06:00:00Z"),
    orderId: "order_x",
    currency: "INR",
    amountMinor: 4_998_000,
    description: "Hiring services",
    lines: [{ label: "Asha K - Full time consulting fee (8.33% of the total mentioned CTC)", detail: "Annual CTC ₹6,00,000", amountMinor: 4_998_000 }],
    seller: {
      name: "Findtern Private Limited",
      address: "386, Jagatpura, Jaipur",
      gstin: "08AAGCF2512F1Z0",
      email: "admin@findtern.in",
      bank: { accountName: "Findtern Private Limited", bankName: "Kotak Mahindra Bank", accountNumber: "5949973545", ifsc: "KKBK0003572" },
    },
    buyer: { name: "Acme", place: { kind: "india", stateCode: "08", stateName: "Rajasthan" } },
  });
  assert.match(html, /8\.33% of the total mentioned CTC/);
  assert.match(html, /Send payments to:/);
  assert.match(html, /KKBK0003572/);
});

test("a new invoice number is the IST date, then the running serial", () => {
  assert.equal(formatInvoiceNumber(new Date("2026-11-02T06:00:00Z"), 124), "021126-124");
  assert.equal(formatInvoiceNumber(new Date("2026-11-02T06:00:00Z"), 8), "021126-08");
});

test("the date is read on the IST clock, not UTC", () => {
  // 20:00 UTC on the 1st is 01:30 IST on the 2nd.
  assert.equal(formatInvoiceNumber(new Date("2026-11-01T20:00:00Z"), 5), "021126-05");
  // 18:29 UTC is still the 1st in India (23:59 IST).
  assert.equal(formatInvoiceNumber(new Date("2026-11-01T18:29:00Z"), 5), "011126-05");
});

test("a number stays within the 16 characters GST allows, digits and hyphen only", () => {
  const n = formatInvoiceNumber(new Date("2027-03-31T10:00:00Z"), 99999);
  assert.ok(n.length <= 16);
  assert.match(n, /^\d{6}-\d+$/);
});

// An invoice for one buyer, the way the Orders page builds it.
function invoiceFor(buyer: { name: string; gstin?: string; city?: string; state?: string; country?: string; pincode?: string }, currency = "INR", amountMinor = 118_000) {
  return taxInvoiceHtml({
    invoiceNo: "021126-124",
    date: new Date("2026-11-02T06:00:00Z"),
    orderId: "order_x",
    currency,
    amountMinor,
    description: "Hiring services",
    seller: { name: "Findtern Private Limited", address: "386, Jagatpura, Jaipur", gstin: "08AAGCF2512F1Z0", email: "admin@findtern.in" },
    buyer: { ...buyer, place: placeOfSupply({ ...buyer, currency }) },
  });
}

test("a Rajasthan PIN code prints CGST and SGST, never IGST, and shows the PIN", () => {
  const html = invoiceFor({ name: "Acme", city: "Jaipur", state: "Rajasthan", country: "India", pincode: "302001" });
  assert.match(html, /CGST 9%<\/span><span>₹\s?90\.00/);
  assert.match(html, /SGST 9%<\/span><span>₹\s?90\.00/);
  assert.doesNotMatch(html, /IGST/);
  assert.match(html, /Place of supply: Rajasthan \(08\)/);
  assert.match(html, /Jaipur, Rajasthan, India/);
  assert.match(html, /PIN code: 302001/);
});

test("any other state's PIN code prints IGST only", () => {
  const html = invoiceFor({ name: "Acme", city: "Mumbai", state: "Maharashtra", country: "India", pincode: "400001" });
  assert.match(html, /IGST 18%<\/span><span>₹\s?180\.00/);
  assert.doesNotMatch(html, /CGST|SGST/);
  assert.match(html, /Place of supply: Maharashtra \(27\)/);
});

test("the PIN code decides the state even when the profile's state text is wrong", () => {
  // Profile says Rajasthan, the billing PIN is Bengaluru's: IGST, Karnataka.
  const html = invoiceFor({ name: "Acme", state: "Rajasthan", pincode: "560001" });
  assert.match(html, /Place of supply: Karnataka \(29\)/);
  assert.match(html, /IGST/);
});

test("a foreign client's invoice prints no GST lines but still carries the SAC", () => {
  const html = invoiceFor({ name: "Globex", country: "United States" }, "USD", 21_000);
  assert.match(html, /Not applicable/);
  assert.doesNotMatch(html, /CGST|SGST|IGST \d/);
  assert.match(html, /Outside India \(export of services\)/);
  assert.match(html, /SAC 998519/);
});
