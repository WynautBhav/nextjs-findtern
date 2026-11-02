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

test("EMH-08: one row per hire, taxable values add up to the order's", () => {
  const rows = lineRows(
    [
      { label: "A - Intern", amountMinor: 100_000 },
      { label: "B - Intern", amountMinor: 200_000 },
    ],
    254_237,
    300_000,
  );
  assert.equal(rows[0].baseMinor! + rows[1].baseMinor!, 254_237);
  // Prices that don't add up to what was paid aren't split.
  const promo = lineRows([{ label: "A", amountMinor: 100_000 }, { label: "B", amountMinor: 100_000 }], 100_000, 150_000);
  assert.deepEqual(promo.map((r) => r.baseMinor), [null, null]);
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
  assert.match(html, /Send payments to/);
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
  assert.match(html, /CGST \(9%\)<\/span><span>₹\s?90\.00/);
  assert.match(html, /SGST \(9%\)<\/span><span>₹\s?90\.00/);
  assert.doesNotMatch(html, /IGST/);
  assert.match(html, /Place of supply: Rajasthan \(08\)/);
  assert.match(html, /Jaipur, Rajasthan, India/);
  assert.match(html, /PIN code: 302001/);
});

test("any other state's PIN code prints IGST only", () => {
  const html = invoiceFor({ name: "Acme", city: "Mumbai", state: "Maharashtra", country: "India", pincode: "400001" });
  assert.match(html, /IGST \(18%\)<\/span><span>₹\s?180\.00/);
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
  assert.doesNotMatch(html, /CGST|SGST|IGST \(/);
  assert.match(html, /Outside India \(export of services\)/);
  assert.match(html, /<td>998519<\/td>/);
});
