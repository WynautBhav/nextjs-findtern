import { invoiceBuyerOf, type LiveEmployerBuyer } from "./invoice-buyer.ts";
import type { InvoiceSeller } from "./invoice.ts";
import type { InvoiceWire, PayrollInvoiceInput, PayrollInvoiceLine } from "./invoice-premium.ts";

/**
 * A payroll invoice (an `employer_payments` row with `raw.kind = "manual_invoice"`) as the admin page and the
 * employer's Orders page both show it. One place turns the stored row into the printable input and the badge, so the
 * two copies of an invoice cannot differ. Pure (no DB, no React, no env): the seller is passed in.
 */

/** What staff and the company see: "created" (issued, awaiting the wire) reads as Due. */
export type ManualInvoiceStatus = "due" | "paid" | "void";

export const manualInvoiceStatus = (status: string): ManualInvoiceStatus => (status === "paid" ? "paid" : status === "void" ? "void" : "due");

export const MANUAL_INVOICE_STATUS_LABEL: Record<ManualInvoiceStatus, string> = { due: "Due", paid: "Paid", void: "Void" };

export type ManualInvoiceRow = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  createdAt: Date | null;
  paidAt: Date | null;
  amountMinor: number;
  raw: unknown;
};

export type ManualInvoiceFacts = {
  proposalId: string;
  period: { start: string; end: string };
  dueOn: string;
  note: string;
  lines: PayrollInvoiceLine[];
  wireReference: string | null;
  issuedAt: Date | null;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const text = (v: unknown) => (typeof v === "string" ? v : "");

/** The frozen facts of an issued invoice, or null when the row is not a well-formed payroll invoice. */
export function manualInvoiceFacts(raw: unknown): ManualInvoiceFacts | null {
  const r = obj(raw);
  const period = obj(r.period);
  const lines = Array.isArray(r.lines) ? r.lines : [];
  const proposalId = text(r.proposalId);
  if (!proposalId || !text(period.start) || !text(period.end)) return null;
  const issued = text(r.issuedAt) ? new Date(text(r.issuedAt)) : null;
  return {
    proposalId,
    period: { start: text(period.start), end: text(period.end) },
    dueOn: text(r.dueOn),
    note: text(r.note),
    lines: lines.map((l) => {
      const line = obj(l);
      return { label: text(line.label), detail: text(line.detail) || null, amountMinor: Number(line.amountMinor) || 0 };
    }),
    wireReference: text(r.wireReference) || null,
    issuedAt: issued && !Number.isNaN(issued.getTime()) ? issued : null,
  };
}

export type PayrollInvoiceContext = {
  /** The hired intern and the role the invoice is for. */
  intern: { name: string; role: string };
  seller: InvoiceSeller & { wire?: InvoiceWire | null };
  /** The company's live profile: used only when the invoice has no frozen buyer. */
  liveBuyer?: LiveEmployerBuyer | null;
};

/** The printable input of one issued invoice (what `payrollInvoiceHtml` takes), or null when it has no number or facts. */
export function payrollInvoiceInputOf(row: ManualInvoiceRow, ctx: PayrollInvoiceContext): PayrollInvoiceInput | null {
  const facts = manualInvoiceFacts(row.raw);
  if (!facts || !row.invoiceNumber) return null;
  const buyer = invoiceBuyerOf(row.raw, ctx.liveBuyer);
  return {
    invoiceNo: row.invoiceNumber,
    issuedOn: facts.issuedAt ?? row.createdAt ?? new Date(0),
    dueOn: facts.dueOn,
    period: facts.period,
    status: manualInvoiceStatus(row.status),
    paidOn: row.paidAt,
    wireReference: facts.wireReference,
    currency: "USD",
    lines: facts.lines,
    note: facts.note,
    intern: ctx.intern,
    seller: ctx.seller,
    buyer: { name: buyer.name, email: buyer.email, city: buyer.city, state: buyer.state, country: buyer.country },
  };
}
