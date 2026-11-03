import { placeOfSupply } from "../gst.ts";
import type { InvoiceInput, InvoiceSeller } from "../invoice.ts";
import { displayInvoiceNumber, INVOICE_KINDS, type AdminInvoiceRow, type InvoiceKind } from "./invoice-rows.ts";

/**
 * What the admin ledger's "Invoice" button prints, as the input to
 * `taxInvoiceHtml`. Pure, so a test can render it. Employer rows print the
 * employer's own number, lines and promo note (from `employerInvoices`);
 * intern fees keep their single SAC 999293 line.
 */
export function adminInvoiceInput(r: AdminInvoiceRow, kind: InvoiceKind, seller: InvoiceSeller): InvoiceInput {
  const k = INVOICE_KINDS[kind];
  const discount = r.discountMinor ?? 0;
  return {
    invoiceNo: displayInvoiceNumber(r, k.invoicePrefix) ?? "",
    date: new Date(r.paidAt ?? r.createdAt ?? Date.now()),
    orderId: r.orderId,
    paymentId: r.paymentId,
    currency: r.currency,
    amountMinor: r.amountMinor,
    description: r.invoiceDescription ?? k.description,
    seller,
    buyer: { ...r.buyer, place: placeOfSupply({ ...r.buyer, currency: r.currency }) },
    sac: k.sac,
    lines: r.invoiceLines?.length ? r.invoiceLines : undefined,
    items: !r.invoiceLines?.length && r.interns ? r.interns.split("; ").filter(Boolean) : undefined,
    promo:
      r.invoicePromo !== undefined
        ? r.invoicePromo
        : // The code, or legacy's "Discount (10%)" line for uncoded discounts (ADM-13).
          r.discountLabel || r.promoCode
          ? { code: r.discountLabel ?? r.promoCode ?? "", discountMinor: discount || null }
          : null,
  };
}
