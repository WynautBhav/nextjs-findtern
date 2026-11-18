/**
 * "View invoice" on an admin Transactions row. A tax invoice exists only for money received that carries an invoice
 * number (see `hasTaxInvoice`); any other row says why there is none. The link opens the ledger (Orders / Intern
 * invoices) on that order, where the existing invoice viewer and PDF live: one invoice renderer, not a second.
 */
export type ViewInvoice = { href: string; reason: null } | { href: null; reason: string };

export function viewInvoice(row: { kind: "employer" | "intern"; status: string; amountMinor: number; invoiceNumber?: string | null; orderId: string }): ViewInvoice {
  const status = row.status.toLowerCase();
  if (!["paid", "refunded", "partially_refunded"].includes(status)) return { href: null, reason: "No invoice: payment not received" };
  if (row.amountMinor <= 0) return { href: null, reason: "No invoice: nothing was charged" };
  if (!row.invoiceNumber?.trim()) return { href: null, reason: "No invoice number yet" };
  const base = row.kind === "employer" ? "/admin/orders" : "/admin/intern-invoices";
  return { href: `${base}?q=${encodeURIComponent(row.orderId)}`, reason: null };
}
