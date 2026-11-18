// Refunds that went back to a company: one row per processed refund on an employer order, with the GST inside it
// and whether a credit note is still owed (CGST s.34: a refund that carried GST needs one; USD orders carry none).
// Pure, so the rule is tested; the same rule drives the money report (lib/admin/receivables.ts).
import { orderRefunds, refundGstMinor } from "../refund-accounting.ts";

export type CompanyRefundOrder = {
  id: string;
  orderId: string;
  employerId: string;
  companyName: string | null;
  invoiceNumber: string | null;
  status: string;
  amountMinor: number;
  currency: string;
  paidAt: Date | null;
  createdAt: Date | null;
  raw: unknown;
};

export type CompanyRefundRow = {
  key: string;
  rowId: string;
  orderId: string;
  employerId: string;
  company: string;
  invoiceNumber: string | null;
  amountMinor: number;
  currency: string;
  gstMinor: number;
  at: string | null;
  creditNote: string | null;
  creditNoteNeeded: boolean;
  /** The order says "refunded" but records no amount; the whole order is counted back. */
  amountNotRecorded: boolean;
};

export function companyRefundRows(orders: readonly CompanyRefundOrder[]): CompanyRefundRow[] {
  const out: CompanyRefundRow[] = [];
  for (const o of orders) {
    const view = orderRefunds(o);
    if (view.refundedMinor <= 0) continue;
    const entries = view.labelOnly ? [{ id: "label", amountMinor: view.refundedMinor, at: null as string | null, creditNote: null as string | null }] : view.refunds;
    let left = view.refundedMinor;
    for (const e of entries) {
      const amountMinor = Math.min(e.amountMinor, left);
      left -= amountMinor;
      if (amountMinor <= 0) continue;
      const gstMinor = refundGstMinor(amountMinor, o.currency);
      const at = e.at ?? (o.paidAt ?? o.createdAt)?.toISOString() ?? null;
      out.push({
        key: `${o.id}:${e.id}`,
        rowId: o.id,
        orderId: o.orderId,
        employerId: o.employerId,
        company: o.companyName?.trim() || "Unknown employer",
        invoiceNumber: o.invoiceNumber,
        amountMinor,
        currency: view.currency,
        gstMinor,
        at,
        creditNote: e.creditNote ?? null,
        creditNoteNeeded: gstMinor > 0 && !e.creditNote,
        amountNotRecorded: view.labelOnly,
      });
    }
  }
  // Credit notes still owed first, the oldest refund on top; then the ones already covered, newest first.
  return out.sort((a, b) => Number(b.creditNoteNeeded) - Number(a.creditNoteNeeded) || (a.creditNoteNeeded ? (a.at ?? "").localeCompare(b.at ?? "") : (b.at ?? "").localeCompare(a.at ?? "")));
}
