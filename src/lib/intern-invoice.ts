import { adminInvoiceInput } from "./admin/invoice-print.ts";
import type { AdminInvoiceRow } from "./admin/invoice-rows.ts";
import { discountLabel, paymentPromo } from "./admin/payment-promo.ts";
import { taxInvoiceHtml, type InvoiceSeller } from "./invoice.ts";

/** An `intern_payments` row joined to the intern's user and onboarding rows (the admin ledger's query shape). */
export type InternPaymentRecord = {
  id: string;
  invoiceNumber: string | null;
  internId: string;
  orderId: string;
  paymentId: string | null;
  gateway: string | null;
  amountMinor: number;
  currency: string | null;
  status: string;
  paidAt: Date | null;
  createdAt: Date | null;
  raw: Record<string, unknown> | null;
  onboardingPayment: Record<string, unknown> | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  pinCode: string | null;
  state: string | null;
};

/** The one mapping behind both the admin Intern invoices ledger and the intern's own copy, so the two prints cannot differ. */
export function internInvoiceRow(inv: InternPaymentRecord): AdminInvoiceRow {
  const name = `${inv.firstName || ""} ${inv.lastName || ""}`.trim() || "Candidate";
  const promo = paymentPromo(inv.raw, inv.onboardingPayment, inv.amountMinor);
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    partyId: inv.internId,
    partyName: name,
    partyEmail: inv.email || "-",
    promoCode: promo.code,
    discountMinor: promo.discountMinor,
    discountLabel: discountLabel(promo, inv.amountMinor),
    orderId: inv.orderId,
    paymentId: inv.paymentId,
    gateway: inv.gateway,
    amountMinor: inv.amountMinor,
    currency: inv.currency || "INR",
    status: inv.status,
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    createdAt: inv.createdAt ? inv.createdAt.toISOString() : null,
    buyer: { name, email: inv.email, pincode: inv.pinCode, state: inv.state },
  };
}

/** What an intern may see: their own, paid, with money and a number. ₹0 activations get no invoice (#2). */
export const isOwnInvoice = (r: InternPaymentRecord, uid: string) =>
  r.internId === uid && r.status === "paid" && r.amountMinor > 0 && !!r.invoiceNumber;

export type InternInvoice = { id: string; number: string; orderId: string; paidAt: string | null; amountMinor: number; currency: string; html: string };

/** Server-side: filter to the session's own rows (again, after the SQL filter) and pre-render each print. */
export function ownInternInvoices(records: InternPaymentRecord[], uid: string, seller: InvoiceSeller): InternInvoice[] {
  return records
    .filter((r) => isOwnInvoice(r, uid))
    .map((r) => {
      const row = internInvoiceRow(r);
      return {
        id: row.id,
        number: r.invoiceNumber as string,
        orderId: row.orderId,
        paidAt: row.paidAt ?? null,
        amountMinor: row.amountMinor,
        currency: row.currency,
        html: taxInvoiceHtml(adminInvoiceInput(row, "intern", seller)),
      };
    });
}
