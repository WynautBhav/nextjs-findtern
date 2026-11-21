import assert from "node:assert/strict";
import { test } from "node:test";

import { LUT_NUMBER } from "./gst.ts";
import { formatPeriod, payrollInvoiceHtml, type PayrollInvoiceInput } from "./invoice-premium.ts";

const base = (over: Partial<PayrollInvoiceInput> = {}): PayrollInvoiceInput => ({
  invoiceNo: "FT/2026-27/0042",
  issuedOn: new Date("2026-11-30T06:00:00Z"),
  dueOn: "2026-12-07",
  period: { start: "2026-11-01", end: "2026-11-30" },
  status: "due",
  currency: "USD",
  lines: [
    { label: "Salary", amountMinor: 400_000 },
    { label: "Overtime", detail: "12 h × $30.00", amountMinor: 36_000 },
    { label: "Payroll management fee", amountMinor: 5_000 },
  ],
  intern: { name: "Aarav Sharma", role: "Frontend Developer" },
  seller: {
    name: "Findtern Private Limited", address: "Jaipur", gstin: "08AAGCF2512F1Z0", email: "admin@findtern.in",
    wire: { accountName: "Findtern Private Limited", bankName: "Test Bank", accountNumber: "123456", swift: "TESTINBB" },
  },
  buyer: { name: "Acme Robotics Inc.", city: "San Francisco", country: "United States" },
  ...over,
});

test("carries the LUT number and the export line", () => {
  const html = payrollInvoiceHtml(base());
  assert.ok(html.includes(`LUT No.: ${LUT_NUMBER}`));
  assert.match(html, /Export of services under LUT without payment of IGST/);
});

test("invoice number is the payment reference, in the wire block and the terms", () => {
  const html = payrollInvoiceHtml(base());
  assert.match(html, /Payment reference<\/dt><dd>FT\/2026-27\/0042<\/dd>/);
  assert.match(html, /Due by 7 Dec 2026\.<\/strong> Please quote FT\/2026-27\/0042 as the payment reference\./);
});

test("USD total is the sum of the lines, formatted", () => {
  const html = payrollInvoiceHtml(base());
  assert.match(html, /\$4,410\.00/);
  assert.match(html, /\$4,000\.00/);
  assert.match(html, /12 h × \$30\.00/);
});

test("no GST rows, no SAC", () => {
  const html = payrollInvoiceHtml(base());
  assert.doesNotMatch(html, /SAC/);
  assert.doesNotMatch(html, /CGST|SGST|IGST 18|Taxable value/);
  // The only "IGST" is the export line.
  assert.equal((html.match(/IGST/g) ?? []).length, 1);
});

test("escapes HTML in every interpolated string", () => {
  const html = payrollInvoiceHtml(
    base({
      lines: [{ label: "<script>alert(1)</script>", detail: '"><img src=x onerror=1>', amountMinor: 100 }],
      note: "<b>note</b>",
      intern: { name: "A<b>", role: "R&D" },
      buyer: { name: "<i>Acme</i>" },
    }),
  );
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<b>note</b>"));
  assert.ok(!html.includes("<i>Acme</i>"));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /R&amp;D/);
});

test("wire block is hidden without SWIFT and without account number", () => {
  const html = payrollInvoiceHtml(base({ seller: { ...base().seller, wire: { bankName: "Test Bank" } } }));
  assert.doesNotMatch(html, /Pay by international wire/);
  assert.doesNotMatch(payrollInvoiceHtml(base({ seller: { ...base().seller, wire: undefined } })), /Pay by international wire/);
  // Only rows that are present are printed.
  const shown = payrollInvoiceHtml(base());
  assert.match(shown, /SWIFT \/ BIC/);
  assert.doesNotMatch(shown, /Intermediary/);
});

test("status stamp: due has none, paid shows date and reference, void says VOID", () => {
  assert.doesNotMatch(payrollInvoiceHtml(base()), /class="stamp/);
  const paid = payrollInvoiceHtml(base({ status: "paid", paidOn: new Date("2026-12-03T06:00:00Z"), wireReference: "WIRE-991" }));
  assert.match(paid, /class="stamp paid"[^]*Paid[^]*3 Dec 2026 · Ref WIRE-991/);
  assert.match(paid, /Total paid/);
  const voided = payrollInvoiceHtml(base({ status: "void" }));
  assert.match(voided, /class="stamp void"[^]*Void/);
});

test("service period reads naturally across months and years", () => {
  assert.equal(formatPeriod("2026-11-01", "2026-11-30"), "1 – 30 Nov 2026");
  assert.equal(formatPeriod("2026-10-28", "2026-11-27"), "28 Oct – 27 Nov 2026");
  assert.equal(formatPeriod("2026-12-28", "2027-01-27"), "28 Dec 2026 – 27 Jan 2027");
});

test("a paid invoice has no payment terms line (nothing is due any more)", () => {
  const html = payrollInvoiceHtml(base({ status: "paid", paidOn: new Date("2026-12-03T06:00:00Z"), wireReference: "WIRE-991" }));
  assert.doesNotMatch(html, /Due by/);
  assert.match(html, /class="stamp paid"/);
});

test("a void invoice asks for no payment", () => {
  const html = payrollInvoiceHtml(base({ status: "void" }));
  assert.doesNotMatch(html, /Pay by international wire|Due by/);
});
