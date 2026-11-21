import assert from "node:assert/strict";
import { test } from "node:test";

import { payrollCounts, payrollPeriods, type PayrollInvoiceDto } from "./payroll-view.ts";
import type { ManualInvoiceRow } from "../payroll-invoice-view.ts";

const entries = (days: [string, number | null][]) => days.map(([date, hours]) => ({ date, status: "Present", ...(hours ? { hours } : {}) }));
const sheet = (id: string, start: string, end: string, status: string, e: unknown = []) => ({
  id, status, entries: e, periodStart: new Date(`${start}T00:00:00Z`), periodEnd: new Date(`${end}T23:59:59.999Z`),
});
const inv = (id: string, status: string, start: string, end: string): ManualInvoiceRow => ({
  id, status, invoiceNumber: `FT/${id}`, createdAt: new Date("2026-12-01T00:00:00Z"), paidAt: null, amountMinor: 1,
  raw: { kind: "manual_invoice", proposalId: "p", period: { start, end }, lines: [] },
});
const toDto = (r: ManualInvoiceRow): PayrollInvoiceDto => ({
  id: r.id, number: r.invoiceNumber!, status: r.status === "created" ? "due" : (r.status as "paid" | "void"), periodStart: "", periodEnd: "", totalMinor: r.amountMinor,
  issuedAt: null, dueOn: "", paidAt: null, wireReference: null, html: "",
});

test("approved sheet: days, total hours, and a prefilled draft", () => {
  const e = entries([["2026-11-03", 8], ["2026-11-04", 10], ["2026-11-05", null], ["2026-11-06", 9.5]]);
  const [p] = payrollPeriods({ sheets: [sheet("s1", "2026-11-01", "2026-11-30", "approved", e)], invoices: [], annualCtcMinor: 60_000_00, toDto });
  assert.equal(p.presentDays, 4);
  assert.equal(p.hours, 35.5);
  assert.deepEqual(p.draft?.map((l) => [l.key, l.amountMinor]), [["salary", 5_000_00], ["payroll_fee", 5000]]);
  assert.equal(p.draft?.[1].detail, "November 2026");
});

test("a sheet that is not approved shows no billable hours and no draft", () => {
  const [p] = payrollPeriods({ sheets: [sheet("s1", "2026-11-01", "2026-11-30", "submitted", entries([["2026-11-03", 12]]))], invoices: [], annualCtcMinor: 1, toDto });
  assert.equal(p.presentDays, null);
  assert.equal(p.hours, null);
  assert.equal(p.draft, null);
});

test("a live invoice replaces the draft; a voided one is listed beside it and the period can be invoiced again", () => {
  const sheets = [sheet("s1", "2026-11-01", "2026-11-30", "approved")];
  const live = payrollPeriods({ sheets, invoices: [inv("a", "void", "2026-11-01", "2026-11-30"), inv("b", "created", "2026-11-01", "2026-11-30")], annualCtcMinor: 1, toDto });
  assert.equal(live[0].invoice?.id, "b");
  assert.equal(live[0].voided.length, 1);
  assert.equal(live[0].draft, null);
  const voidedOnly = payrollPeriods({ sheets, invoices: [inv("a", "void", "2026-11-01", "2026-11-30")], annualCtcMinor: 1, toDto });
  assert.equal(voidedOnly[0].invoice, null);
  assert.ok(voidedOnly[0].draft);
});

test("periods are newest first, an invoice with no sheet still gets a row, counts add up", () => {
  const periods = payrollPeriods({
    sheets: [sheet("s1", "2026-10-01", "2026-10-31", "approved"), sheet("s2", "2026-11-01", "2026-11-30", "approved")],
    invoices: [inv("a", "created", "2026-10-01", "2026-10-31"), inv("z", "paid", "2026-09-01", "2026-09-30")],
    annualCtcMinor: 1, toDto,
  });
  assert.deepEqual(periods.map((p) => p.start), ["2026-11-01", "2026-10-01", "2026-09-01"]);
  assert.equal(periods[2].sheetStatus, null);
  assert.deepEqual(payrollCounts(periods), { toInvoice: 1, due: 1 });
});
