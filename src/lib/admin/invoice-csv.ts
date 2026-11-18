import { formatIstStamp } from "../format.ts";
import { LUT_NUMBER, placeOfSupply, splitGst } from "../gst.ts";
import type { CsvColumn } from "./csv.ts";
import { displayInvoiceNumber, INVOICE_KINDS, type AdminInvoiceRow, type InvoiceKind } from "./invoice-rows.ts";

const gstBase = (r: AdminInvoiceRow) => splitGst(r.amountMinor, placeOfSupply({ ...r.buyer, currency: r.currency })).baseMinor;
const rupees = (minor: number) => (minor / 100).toFixed(2);

/** The Orders / Intern invoices export: money in major units with 2 decimals in the row's own currency, India time, refunds beside the amount. */
export function invoiceCsvColumns(kind: InvoiceKind): CsvColumn<AdminInvoiceRow>[] {
  const k = INVOICE_KINDS[kind];
  const refunded = (r: AdminInvoiceRow) => Math.min(r.refundedMinor ?? 0, r.amountMinor);
  return [
    { header: "Invoice number", value: (r) => displayInvoiceNumber(r, k.invoicePrefix) ?? "" },
    { header: "Order ID", value: (r) => r.orderId },
    { header: "Payment ID", value: (r) => r.paymentId },
    { header: "Gateway", value: (r) => r.gateway ?? "" },
    { header: k.party, value: (r) => r.partyName },
    { header: "Email", value: (r) => r.partyEmail },
    ...(kind === "employer" ? [{ header: "Interns", value: (r: AdminInvoiceRow) => r.interns ?? "" }] : []),
    { header: "Amount", value: (r) => rupees(r.amountMinor) },
    { header: "Currency", value: (r) => r.currency },
    // 18% GST is included in INR amounts; USD (export) carries none.
    { header: "Amount before GST", value: (r) => rupees(gstBase(r)) },
    { header: "GST", value: (r) => rupees(r.amountMinor - gstBase(r)) },
    { header: "Discount", value: (r) => rupees(r.discountMinor ?? 0) },
    { header: "Promo code", value: (r) => r.promoCode ?? "" },
    { header: "Refunded", value: (r) => rupees(refunded(r)) },
    { header: "Net of refunds", value: (r) => rupees(r.amountMinor - refunded(r)) },
    { header: "Status", value: (r) => r.status },
    { header: "Needs review", value: (r) => (r.needsReview ? "yes" : "") },
    { header: "Review reasons", value: (r) => (r.reviewReasons ?? []).join("; ") },
    { header: "Paid at (IST)", value: (r) => formatIstStamp(r.paidAt) },
    { header: "Created at (IST)", value: (r) => formatIstStamp(r.createdAt) },
    // Findtern's own LUT number, the same on every invoice (last, so existing column positions hold).
    { header: "LUT number", value: () => LUT_NUMBER },
  ];
}
