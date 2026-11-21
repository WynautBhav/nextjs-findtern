import assert from "node:assert/strict";
import { test } from "node:test";

import { manualInvoiceFacts, manualInvoiceStatus, payrollInvoiceInputOf, type ManualInvoiceRow } from "./payroll-invoice-view.ts";
import { payrollInvoiceHtml } from "./invoice-premium.ts";

const raw = {
  kind: "manual_invoice",
  proposalId: "p1",
  period: { start: "2026-11-01", end: "2026-11-30" },
  lines: [
    { key: "salary", label: "Salary", amountMinor: 400_000 },
    { key: "payroll_fee", label: "Payroll management fee", detail: "November 2026", amountMinor: 5_000 },
  ],
  dueOn: "2026-12-07",
  note: "Thank you",
  issuedAt: "2026-11-30T06:00:00.000Z",
  invoiceBuyer: { name: "Acme Robotics Inc.", country: "United States" },
};
const row = (over: Partial<ManualInvoiceRow> = {}): ManualInvoiceRow => ({
  id: "i1", invoiceNumber: "FT/2026-27/0042", status: "created", createdAt: new Date("2026-11-30T06:00:01Z"), paidAt: null, amountMinor: 405_000, raw, ...over,
});
const ctx = { intern: { name: "Aarav Sharma", role: "Frontend Developer" }, seller: { name: "Findtern", address: "Jaipur", gstin: null, email: "a@b.c" } };

test("created reads as Due, paid and void keep their names", () => {
  assert.deepEqual(["created", "paid", "void", "anything"].map(manualInvoiceStatus), ["due", "paid", "void", "due"]);
});

test("the stored row becomes the printable input, buyer frozen at issue", () => {
  const input = payrollInvoiceInputOf(row(), { ...ctx, liveBuyer: { companyName: "Renamed Inc." } });
  assert.ok(input);
  assert.equal(input.buyer.name, "Acme Robotics Inc.");
  assert.equal(input.status, "due");
  assert.equal(input.issuedOn.toISOString(), "2026-11-30T06:00:00.000Z");
  assert.equal(input.lines[1].detail, "November 2026");
  const html = payrollInvoiceHtml(input);
  assert.match(html, /FT\/2026-27\/0042/);
  assert.match(html, /\$4,050\.00/);
});

test("a row with no number or no period prints nothing", () => {
  assert.equal(payrollInvoiceInputOf(row({ invoiceNumber: null }), ctx), null);
  assert.equal(manualInvoiceFacts({ kind: "manual_invoice" }), null);
});
