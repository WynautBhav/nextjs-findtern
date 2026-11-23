import { adminInvoiceInput } from "./admin/invoice-print.ts";
import type { AdminInvoiceRow } from "./admin/invoice-rows.ts";
import { discountLabel, paymentPromo } from "./admin/payment-promo.ts";
import { taxInvoiceHtml, type InvoiceSeller } from "./invoice.ts";
import { waiverFlagOf } from "./full-waiver.ts";

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
    waivedMinor: waiverFlagOf(inv.raw)?.waivedMinor ?? null,
    amountMinor: inv.amountMinor,
    currency: inv.currency || "INR",
    status: inv.status,
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    createdAt: inv.createdAt ? inv.createdAt.toISOString() : null,
    buyer: { name, email: inv.email, pincode: inv.pinCode, state: inv.state },
  };
}

/**
 * Does a ₹0 activation get a GST invoice number? Yes when a promo or full-waiver code made it free (the invoice shows the
 * discount line). No for test mode (`raw.testMode`, free-payments mode) and for a college code: the college is invoiced
 * through its seat batch, so a second invoice (and a serial) for the same seat would double-count it.
 */
export function zeroValueInvoiceEligible(raw: Record<string, unknown> | null | undefined): boolean {
  if (!raw || raw.testMode === true || raw.collegePromo === true) return false;
  return paymentPromo(raw).code !== null;
}

/**
 * The `raw` the intern activation route stores for a promo order. A college code carries `collegePromo` (as the college redeem
 * route writes it) so the invoice rule never has to guess from the code text.
 */
export function activationRaw(promo: { code: string; collegeId?: string | null } | null, discountMinor: number): Record<string, unknown> {
  if (!promo) return {};
  return { promoCode: promo.code, discountMinor, ...(promo.collegeId ? { declaredAdult: true, collegePromo: true } : {}) };
}

/**
 * Settlement's serial decision. `collegeId` is the redeemed promo row's college: it wins over `raw`, so a row stored without the
 * `collegePromo` flag still takes no serial. A paid order always does.
 */
export function internInvoiceNumbered(amountMinor: number, raw: Record<string, unknown> | null | undefined, collegeId: string | null | undefined): boolean {
  return amountMinor > 0 || (!collegeId && zeroValueInvoiceEligible(raw));
}

/** What an intern may see: their own, paid, with a number. A ₹0 row shows only when a code made it free (B-54); number-less ₹0 rows stay hidden. */
export const isOwnInvoice = (r: InternPaymentRecord, uid: string) =>
  r.internId === uid && r.status === "paid" && !!r.invoiceNumber && (r.amountMinor > 0 || zeroValueInvoiceEligible(r.raw));

export type InternInvoice = { id: string; number: string; orderId: string; paidAt: string | null; amountMinor: number; currency: string; /** The promo code used and what it took off (0 when none); the print shows both as rows. */ promoCode: string | null; discountMinor: number; html: string };

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
        promoCode: row.promoCode ?? null,
        discountMinor: row.discountMinor ?? 0,
        html: taxInvoiceHtml(adminInvoiceInput(row, "intern", seller)),
      };
    });
}
