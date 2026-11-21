import { dayDetails, overtimeOf } from "../employer-timesheets.ts";
import { manualInvoiceFacts, manualInvoiceStatus, type ManualInvoiceRow, type ManualInvoiceStatus } from "../payroll-invoice-view.ts";
import { payrollDraft } from "../payroll-invoice.ts";

/**
 * The admin Payroll tab: for each hired USD full-time placement, one row per timesheet period with its approved
 * hours and the invoice (if any) issued for it. Pure (no DB, no React, no env), so the shaping is tested; the loader
 * (payroll-load.ts) supplies the rows and the printable HTML. Everything here is plain data a client component takes.
 */

export type DraftLineDto = { key: "salary" | "overtime" | "payroll_fee" | "extra"; label: string; detail: string; amountMinor: number };

export type PayrollInvoiceDto = {
  id: string;
  number: string;
  status: ManualInvoiceStatus;
  periodStart: string;
  periodEnd: string;
  totalMinor: number;
  /** ISO instants and days, ready to format on the client. */
  issuedAt: string | null;
  dueOn: string;
  paidAt: string | null;
  wireReference: string | null;
  /** The finished invoice page, rendered on the server (the client never sees the seller's env). */
  html: string;
};

export type PayrollPeriodDto = {
  /** The period's first day (YYYY-MM-DD): also the invoice's identity for the placement (one live invoice per start). */
  start: string;
  end: string;
  sheetId: string | null;
  /** Timesheet status as stored ("approved", "submitted", "draft", "rejected"); null when no sheet exists for the period. */
  sheetStatus: string | null;
  /** Counted only once approved: until then the hours are not billable. */
  presentDays: number | null;
  regularHours: number | null;
  overtimeHours: number | null;
  /** The invoice that is not void (due or paid). */
  invoice: PayrollInvoiceDto | null;
  /** Earlier invoices for the same period that were voided (their numbers stay). */
  voided: PayrollInvoiceDto[];
  /** Prefilled lines when the period is approved and has no live invoice; null otherwise. */
  draft: DraftLineDto[] | null;
};

export type PayrollPlacementDto = {
  proposalId: string;
  employerId: string;
  company: string;
  intern: string;
  role: string;
  /** YYYY-MM-DD, or null when the offer has no real joining day. */
  joining: string | null;
  annualCtcMinor: number | null;
  overtimeRateMinor: number | null;
  periods: PayrollPeriodDto[];
};

export type SheetLike = { id: string; periodStart: Date; periodEnd: Date; status: string; entries: unknown };

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Newest period first. `toDto` renders one stored invoice (null when it cannot be printed, which hides it). */
export function payrollPeriods(input: {
  sheets: readonly SheetLike[];
  invoices: readonly ManualInvoiceRow[];
  annualCtcMinor: number | null;
  overtimeRateMinor: number | null;
  toDto: (row: ManualInvoiceRow) => PayrollInvoiceDto | null;
}): PayrollPeriodDto[] {
  const byStart = new Map<string, PayrollPeriodDto>();
  const put = (start: string, end: string) => {
    let p = byStart.get(start);
    if (!p) {
      p = { start, end, sheetId: null, sheetStatus: null, presentDays: null, regularHours: null, overtimeHours: null, invoice: null, voided: [], draft: null };
      byStart.set(start, p);
    }
    return p;
  };

  for (const s of input.sheets) {
    const p = put(day(s.periodStart), day(s.periodEnd));
    p.sheetId = s.id;
    p.sheetStatus = s.status;
    if (s.status === "approved") {
      const { regularHours, overtimeHours } = overtimeOf(s.entries, s.periodStart, s.periodEnd);
      p.presentDays = dayDetails(s.entries, s.periodStart, s.periodEnd).filter((d) => d.status === "Present").length;
      p.regularHours = regularHours;
      p.overtimeHours = overtimeHours;
    }
  }

  for (const row of input.invoices) {
    const facts = manualInvoiceFacts(row.raw);
    const dto = input.toDto(row);
    if (!facts || !dto) continue;
    const p = put(facts.period.start, facts.period.end);
    if (manualInvoiceStatus(row.status) === "void") p.voided.push(dto);
    else p.invoice = dto;
  }

  for (const p of byStart.values()) {
    if (p.sheetStatus === "approved" && !p.invoice) {
      p.draft = payrollDraft({ annualCtcMinor: input.annualCtcMinor ?? 0, overtimeHours: p.overtimeHours ?? 0, overtimeRateMinor: input.overtimeRateMinor, periodEnd: p.end }).map((l) => ({
        key: l.key,
        label: l.label,
        detail: l.detail ?? "",
        amountMinor: l.amountMinor,
      }));
    }
  }

  return [...byStart.values()].sort((a, b) => b.start.localeCompare(a.start));
}

/** Periods that are approved and still need an invoice, and invoices still waiting for the wire. */
export function payrollCounts(periods: readonly PayrollPeriodDto[]): { toInvoice: number; due: number } {
  return {
    toInvoice: periods.filter((p) => p.draft !== null).length,
    due: periods.filter((p) => p.invoice?.status === "due").length,
  };
}
