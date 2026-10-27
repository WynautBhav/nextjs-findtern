import type { InvoiceBuyerProfile } from "../gst.ts";

/**
 * Employer orders and intern activation fees, as one row shape, plus the
 * filters both admin ledgers share. Pure (no DB, no React), so the page, the
 * CSV and the tests cannot disagree about which rows a filter keeps.
 */

/** One payment row, from either employer orders or intern activation fees. */
export type AdminInvoiceRow = {
  id: string;
  /** FY serial stored at payment ("FT/2026-27/0001"); null for unpaid / legacy rows. */
  invoiceNumber?: string | null;
  orderId: string;
  paymentId?: string | null;
  /** razorpay / free / manual; null when unknown. */
  gateway?: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  paidAt?: string | null;
  createdAt: string | null;
  partyId: string;
  partyName: string;
  partyEmail: string;
  buyer: InvoiceBuyerProfile;
  /** Interns this order paid for (employer orders). */
  interns?: string;
  promoCode?: string | null;
  /** Discount in minor units (0 = none recorded). */
  discountMinor?: number | null;
  /** Invoice line for the discount: the code, or legacy "Discount (10%)". */
  discountLabel?: string | null;
  /** Paid, but not every proposal could be hired - accounts should refund the difference. */
  needsReview?: boolean;
  /** Paid outside this ledger (only the profile's paid flag records it). */
  flagOnly?: boolean;
};

export const isPaidRow = (r: Pick<AdminInvoiceRow, "status">) => r.status === "paid" || r.status === "captured";

/**
 * A tax invoice exists only for money actually received. Unpaid, failed and
 * ₹0 rows used to print a TAX INVOICE with a made-up number (ADM-06).
 */
export const hasTaxInvoice = (r: Pick<AdminInvoiceRow, "status" | "amountMinor">) => isPaidRow(r) && r.amountMinor > 0;

/** The number shown in the table and searched: the stored serial, or the PDF's fallback for paid rows. */
export function displayInvoiceNumber(r: Pick<AdminInvoiceRow, "id" | "invoiceNumber" | "status" | "amountMinor">, prefix: string): string | null {
  if (r.invoiceNumber) return r.invoiceNumber;
  return hasTaxInvoice(r) ? `${prefix}-${r.id.slice(0, 8).toUpperCase()}` : null;
}

export type InvoiceFilters = {
  q: string;
  status: string;
  currency: string;
  /** "", "with", "without" */
  promo: string;
  /** One exact code (case-insensitive). */
  code: string;
  from: string;
  to: string;
};

export function invoiceFilters(params: Record<string, string | undefined>): InvoiceFilters {
  const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  return {
    q: (params.q ?? "").trim(),
    status: params.status ?? "",
    currency: params.currency ?? "",
    promo: params.promo === "with" || params.promo === "without" ? params.promo : "",
    code: (params.code ?? "").trim(),
    from: date(params.from),
    to: date(params.to),
  };
}

/** `YYYY-MM-DD` bounds, inclusive; empty bounds are open. Compared in India time. */
export function inDateRange(at: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!at) return false;
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return false;
  const day = new Date(t.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}

export function filterInvoiceRows(rows: AdminInvoiceRow[], f: InvoiceFilters, invoicePrefix: string): AdminInvoiceRow[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const code = f.code.toLowerCase();
  return rows.filter((r) => {
    if (words.length) {
      const hay = [
        r.orderId,
        r.paymentId ?? "",
        r.partyName,
        r.partyEmail,
        r.interns ?? "",
        r.promoCode ?? "",
        displayInvoiceNumber(r, invoicePrefix) ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    if (f.status === "paid" ? !isPaidRow(r) : f.status && r.status !== f.status) return false;
    if (f.currency && r.currency !== f.currency) return false;
    const promoApplied = Boolean(r.promoCode) || (r.discountMinor ?? 0) > 0;
    if (f.promo === "with" && !promoApplied) return false;
    if (f.promo === "without" && promoApplied) return false;
    if (code && (r.promoCode ?? "").toLowerCase() !== code) return false;
    return inDateRange(r.paidAt ?? r.createdAt, f.from, f.to);
  });
}

/** Distinct promo codes, for the per-code filter. */
export function promoCodeOptions(rows: AdminInvoiceRow[]): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const c = r.promoCode?.trim();
    if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function gatewayLabel(gateway: string | null | undefined): string {
  if (!gateway) return "-";
  const g = gateway.toLowerCase();
  return g === "razorpay" ? "Razorpay" : g === "free" ? "Free (100% code)" : g === "manual" ? "Manual" : gateway;
}

/** Per-ledger wording and invoice details. */
export const INVOICE_KINDS = {
  employer: {
    party: "Company",
    noun: "orders",
    hrefBase: "/admin/companies",
    csv: "employer-orders",
    invoicePrefix: "INV",
    description: "Intern hiring services (per-hire charge and hourly engagement)",
    sac: undefined as string | undefined,
  },
  intern: {
    party: "Intern",
    noun: "payments",
    hrefBase: "/admin/interns",
    csv: "intern-invoices",
    invoicePrefix: "FT-INT",
    description: "Candidate activation: AI interview, talent profiling and placement guarantee as per terms",
    sac: "999293" as string | undefined,
  },
} as const;

export type InvoiceKind = keyof typeof INVOICE_KINDS;

export type InvoiceSort = "date" | "amount" | "party";

export function sortInvoiceRows(rows: AdminInvoiceRow[], key: InvoiceSort, dir: "asc" | "desc"): AdminInvoiceRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const when = (r: AdminInvoiceRow) => Date.parse(r.paidAt ?? r.createdAt ?? "") || 0;
  return [...rows].sort((a, b) => {
    const v =
      key === "amount" ? a.amountMinor - b.amountMinor : key === "party" ? a.partyName.localeCompare(b.partyName) : when(a) - when(b);
    return v * sign || when(b) - when(a);
  });
}
