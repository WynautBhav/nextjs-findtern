import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { PAYROLL_FEE_USD_MINOR } from "./checkout.ts";
import { isRealDay } from "./offer.ts";

/**
 * The monthly invoice Findtern sends a company abroad for a payroll-managed full-time hire: the intern's salary
 * and overtime (passed through to the intern) plus the payroll management fee (Findtern's revenue). Pure, so the
 * prefill, the issue checks and the pass-through figure are tested without a database.
 */

/** `salary` and `overtime` are the intern's money; `payroll_fee` and `extra` (a bonus, an adjustment) are not. */
export const PAYROLL_LINE_KEYS = ["salary", "overtime", "payroll_fee", "extra"] as const;
export type PayrollLineKey = (typeof PAYROLL_LINE_KEYS)[number];

export type PayrollLine = { key: PayrollLineKey; label: string; detail?: string; amountMinor: number };

/** The `employer_payments.raw.kind` of an invoice staff issue by hand (it is never a checkout order). */
export const MANUAL_INVOICE_KIND = "manual_invoice";

export function isManualInvoiceRaw(raw: unknown): boolean {
  return typeof raw === "object" && raw !== null && (raw as { kind?: unknown }).kind === MANUAL_INVOICE_KIND;
}

/**
 * SQL guard for the sweeps and cancels of unpaid checkout orders: pass the row's `raw` column. A payroll invoice's
 * "created" status means "issued, awaiting the wire", so none of them may close it as failed.
 */
export const notManualInvoice = (raw: SQLWrapper): SQL => sql`coalesce(${raw}->>'kind', '') <> ${MANUAL_INVOICE_KIND}`;

/** The three standard lines, prefilled for staff to edit before issuing. A month with no overtime keeps a 0 line. */
export function payrollDraft(i: { annualCtcMinor: number; overtimeHours: number; overtimeRateMinor: number | null; /** YYYY-MM-DD, names the month on the fee line. */ periodEnd?: string }): PayrollLine[] {
  const rate = i.overtimeRateMinor ?? 0;
  // The year of Findtern Pro comes once, with the hire; the monthly fee line never mentions it.
  const month = i.periodEnd && isRealDay(i.periodEnd) ? new Date(`${i.periodEnd}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : undefined;
  const hours = Number(i.overtimeHours.toFixed(2));
  return [
    { key: "salary", label: "Salary", amountMinor: Math.round(i.annualCtcMinor / 12) },
    { key: "overtime", label: "Overtime", detail: `${hours} h × $${(rate / 100).toFixed(2)}`, amountMinor: Math.round(hours * rate) },
    { key: "payroll_fee", label: "Payroll management fee", ...(month ? { detail: month } : {}), amountMinor: PAYROLL_FEE_USD_MINOR },
  ];
}

/** What of the invoice is the intern's pay (salary + overtime). Revenue leaves this out. */
export function passThroughOf(lines: readonly Pick<PayrollLine, "key" | "amountMinor">[]): number {
  return lines.filter((l) => l.key === "salary" || l.key === "overtime").reduce((sum, l) => sum + l.amountMinor, 0);
}

/** Largest total one invoice can hold (amount_minor is a 32-bit integer): $20,000,000.00. */
export const MAX_INVOICE_TOTAL_MINOR = 2_000_000_000;

export type IssueInput = {
  lines: readonly PayrollLine[];
  currency: string;
  period: { start: string; end: string };
  dueOn: string;
};

/** Everything an invoice must satisfy before it gets a number: once issued its lines and amounts never change. */
export function validateIssue(i: IssueInput): { ok: true; totalMinor: number } | { ok: false; error: string } {
  if (i.currency !== "USD") return { ok: false, error: "Payroll invoices are in USD." };
  if (!Array.isArray(i.lines) || i.lines.length === 0) return { ok: false, error: "Add at least one line." };
  for (const l of i.lines) {
    if (!l || typeof l.label !== "string" || l.label.trim() === "") return { ok: false, error: "Every line needs a label." };
    if (!Number.isInteger(l.amountMinor) || l.amountMinor < 0) return { ok: false, error: "Every amount must be a whole number of cents, zero or more." };
  }
  const totalMinor = i.lines.reduce((sum, l) => sum + l.amountMinor, 0);
  if (totalMinor <= 0) return { ok: false, error: "The total must be above zero." };
  // amount_minor is a 32-bit integer; refuse in words instead of failing the insert.
  if (totalMinor > MAX_INVOICE_TOTAL_MINOR) return { ok: false, error: "The total is too large for one invoice." };
  const { start, end } = i.period ?? {};
  if (typeof start !== "string" || typeof end !== "string" || !isRealDay(start) || !isRealDay(end) || start > end) {
    return { ok: false, error: "The service period is not valid." };
  }
  if (typeof i.dueOn !== "string" || !isRealDay(i.dueOn)) return { ok: false, error: "The due date is not valid." };
  return { ok: true, totalMinor };
}
