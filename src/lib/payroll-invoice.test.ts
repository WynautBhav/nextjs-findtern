import assert from "node:assert/strict";
import { test } from "node:test";

import { isManualInvoiceRaw, passThroughOf, payrollDraft, validateIssue, type PayrollLine } from "./payroll-invoice.ts";

test("payrollDraft: salary is CTC / 12, overtime is hours x rate, fee is $50", () => {
  const lines = payrollDraft({ annualCtcMinor: 60_000_00, overtimeHours: 3.5, overtimeRateMinor: 12_50 });
  assert.deepEqual(
    lines.map((l) => [l.key, l.amountMinor]),
    [["salary", 5_000_00], ["overtime", 4375], ["payroll_fee", 5000]],
  );
  assert.equal(lines[1].detail, "3.5 h × $12.50");
  assert.equal(lines[0].label, "Salary");
  assert.equal(lines[2].label, "Payroll management fee");
});

test("payrollDraft: the fee line names the month and never mentions Findtern Pro", () => {
  const lines = payrollDraft({ annualCtcMinor: 60_000_00, overtimeHours: 0, overtimeRateMinor: null, periodEnd: "2026-11-30" });
  assert.equal(lines[2].detail, "November 2026");
  assert.ok(!lines.some((l) => /pro\b/i.test(`${l.label} ${l.detail ?? ""}`)));
  assert.equal(payrollDraft({ annualCtcMinor: 1, overtimeHours: 0, overtimeRateMinor: null })[2].detail, undefined);
});

test("payrollDraft: CTC that does not divide by 12 rounds to a cent; no overtime keeps a zero line", () => {
  const lines = payrollDraft({ annualCtcMinor: 100_000, overtimeHours: 0, overtimeRateMinor: null });
  assert.equal(lines[0].amountMinor, 8333);
  assert.equal(lines[1].amountMinor, 0);
  assert.equal(lines.length, 3);
});

test("passThroughOf: salary and overtime are the intern's money, the fee and extras are Findtern's", () => {
  const lines: PayrollLine[] = [
    { key: "salary", label: "Salary", amountMinor: 5000_00 },
    { key: "overtime", label: "Overtime", amountMinor: 100_00 },
    { key: "payroll_fee", label: "Payroll management fee", amountMinor: 5000 },
    { key: "extra", label: "Bonus", amountMinor: 200_00 },
  ];
  assert.equal(passThroughOf(lines), 5100_00);
});

const good = {
  lines: payrollDraft({ annualCtcMinor: 60_000_00, overtimeHours: 2, overtimeRateMinor: 1000 }),
  currency: "USD",
  period: { start: "2026-10-01", end: "2026-10-31" },
  dueOn: "2026-11-07",
};

test("validateIssue: a good draft returns its total", () => {
  assert.deepEqual(validateIssue(good), { ok: true, totalMinor: 5_000_00 + 2000 + 5000 });
});

test("validateIssue refuses bad drafts", () => {
  const bad = (patch: Record<string, unknown>) => validateIssue({ ...good, ...patch } as never);
  assert.equal(bad({ lines: [] }).ok, false);
  assert.equal(bad({ currency: "INR" }).ok, false);
  assert.equal(bad({ lines: [{ key: "salary", label: "Salary", amountMinor: -1 }] }).ok, false);
  assert.equal(bad({ lines: [{ key: "salary", label: "Salary", amountMinor: 10.5 }] }).ok, false);
  assert.equal(bad({ lines: [{ key: "salary", label: "Salary", amountMinor: 0 }] }).ok, false, "total must be above zero");
  assert.equal(bad({ lines: [{ key: "salary", label: " ", amountMinor: 100 }] }).ok, false, "a line needs a label");
  assert.equal(bad({ period: { start: "2026-10-31", end: "2026-10-01" } }).ok, false);
  assert.equal(bad({ period: { start: "2026-02-30", end: "2026-03-01" } }).ok, false);
  assert.equal(bad({ period: { start: "2026-10-01", end: "soon" } }).ok, false);
  assert.equal(bad({ dueOn: "2026-13-01" }).ok, false);
  assert.equal(bad({ dueOn: "" }).ok, false);
});

test("isManualInvoiceRaw", () => {
  assert.equal(isManualInvoiceRaw({ kind: "manual_invoice" }), true);
  assert.equal(isManualInvoiceRaw({ kind: "employer_subscription" }), false);
  assert.equal(isManualInvoiceRaw(null), false);
  assert.equal(isManualInvoiceRaw("manual_invoice"), false);
});

test("validateIssue: a total past the 32-bit column is refused in words", () => {
  const big = { ...good, lines: [{ key: "salary", label: "Salary", amountMinor: 1_000_000_000 }, { key: "extra", label: "Bonus", amountMinor: 1_000_000_001 }] } as typeof good;
  const r = validateIssue(big);
  assert.equal(r.ok, false);
});
