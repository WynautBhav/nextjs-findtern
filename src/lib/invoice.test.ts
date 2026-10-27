import assert from "node:assert/strict";
import { test } from "node:test";

import { displayInvoiceNumber, legacyInvoiceNumber, lineRows, taxInvoiceHtml } from "./invoice.ts";

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
