import { isFullWaiverGateway, ledgerTotals } from "./revenue.ts";
import { hasTaxInvoice, type AdminInvoiceRow, type InvoiceSort } from "./invoice-rows.ts";
import { isSettledStatus } from "../refund-accounting.ts";

/**
 * The figures above the Intern invoices ledger, over the rows the filters keep (all of them, not the page).
 * Money comes from the one money layer (`ledgerTotals`); the counts are about invoices, so a ₹0 activation
 * (a 100% code) is counted apart: it has no tax invoice and no money.
 */
export function internInvoiceSummary(rows: AdminInvoiceRow[]) {
  const t = ledgerTotals(rows);
  let invoiceCount = 0;
  let freeCount = 0;
  for (const r of rows) {
    if (r.flagOnly || isFullWaiverGateway(r) || !isSettledStatus(r.status)) continue;
    if (hasTaxInvoice(r)) invoiceCount += 1;
    else if (r.amountMinor === 0) freeCount += 1;
  }
  return {
    collectedMinor: t.collectedMinor,
    invoiceCount,
    freeCount,
    discountMinor: t.discountMinor,
    notCollectedMinor: t.notCollectedMinor,
    notCollectedCount: t.notCollectedCount,
    markedPaidCount: t.markedPaidCount,
    waivedCount: t.waivedCount ?? 0,
  };
}

/** The ordering choices on the page, as one `order` value: newest, oldest, highest, lowest, name. */
export const INVOICE_ORDERS = {
  newest: { key: "date", dir: "desc", label: "Newest first" },
  oldest: { key: "date", dir: "asc", label: "Oldest first" },
  highest: { key: "amount", dir: "desc", label: "Highest amount" },
  lowest: { key: "amount", dir: "asc", label: "Lowest amount" },
  name: { key: "party", dir: "asc", label: "Intern A to Z" },
} as const satisfies Record<string, { key: InvoiceSort; dir: "asc" | "desc"; label: string }>;

export type InvoiceOrder = keyof typeof INVOICE_ORDERS;

/** `order` from the URL; an old `?sort=&dir=` link still works; anything else is newest first. */
export function invoiceOrder(params: Record<string, string | undefined>): InvoiceOrder {
  const o = params.order;
  if (o && Object.hasOwn(INVOICE_ORDERS, o)) return o as InvoiceOrder;
  const hit = (Object.entries(INVOICE_ORDERS) as [InvoiceOrder, (typeof INVOICE_ORDERS)[InvoiceOrder]][]).find(([, v]) => v.key === params.sort && v.dir === (params.dir === "asc" ? "asc" : "desc"));
  return hit ? hit[0] : "newest";
}
