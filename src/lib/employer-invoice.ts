import { displayInvoiceNumber, LEGACY_INVOICE_CUTOFF, type InvoiceLine } from "./invoice.ts";
import { hireInvoiceLines } from "./invoice-lines.ts";
import { formatMoney } from "./format.ts";
import { parseOffer } from "./offer.ts";
import { orderProposalIds } from "./order-ids.ts";

/**
 * The one place an employer payment becomes an invoice number, a description
 * and its lines. The employer's Orders page and the admin ledger both call
 * `employerInvoice`, so the two copies of an invoice cannot drift apart.
 * Pure (no DB, no React).
 */

export type InvoicePayment = {
  id: string;
  orderId: string;
  invoiceNumber?: string | null;
  status: string;
  paidAt: Date | null;
  amountMinor: number;
  raw: unknown;
};

/** A hire as the invoice sees it: the proposal's offer, the candidate and the project. */
export type InvoiceHire = {
  proposalId: string;
  offerDetails: unknown;
  currency: string | null;
  who: string;
  projectName: string | null;
};

/** Paid payments whose number is DDMMYY-NN: before the cut-over or with no stored number. */
export const needsLegacyNumber = (p: { status: string; paidAt: Date | null; invoiceNumber?: string | null }) =>
  p.status === "paid" && Boolean(p.paidAt) && (p.paidAt! < LEGACY_INVOICE_CUTOFF || !p.invoiceNumber);

const isPaid = (p: { status: string }) => p.status === "paid";

export function employerInvoice(input: {
  payment: InvoicePayment;
  /** The payments to look for this hire's earlier instalments in (at least this employer's). */
  allPayments: readonly InvoicePayment[];
  /** Paid refs of EVERY employer payment that gets a legacy DDMMYY-NN number (see `needsLegacyNumber`): the NN counts them all. */
  legacyPaid: readonly { orderId: string; paidAt: Date | string | null }[];
  hires: ReadonlyMap<string, InvoiceHire>;
}): { number: string; description: string; monthly: boolean; lines: InvoiceLine[]; hireNames: string[]; projects: string[] } {
  const { payment: p, allPayments, legacyPaid, hires } = input;
  const ids = orderProposalIds(p.raw as Record<string, unknown> | null);
  const rows = ids.map((id) => hires.get(id)).filter((r): r is InvoiceHire => Boolean(r));
  const monthly = ((p.raw as { notes?: { paymentMode?: string } } | null)?.notes?.paymentMode ?? "") === "monthly";

  const lines: InvoiceLine[] = rows.flatMap((r) => {
    const offer = parseOffer(r.offerDetails as never, r.currency as never);
    if (offer.fullTime) {
      return [
        {
          label: `${r.who} - Full time consulting fee (8.33% of the total mentioned CTC)`,
          detail: offer.fullTime.annualCtcMinor
            ? `${offer.roleTitle || "Full-time role"} · Annual CTC ${formatMoney(offer.fullTime.annualCtcMinor, offer.currency, { zeroLabel: false })}`
            : offer.roleTitle || null,
          amountMinor: rows.length === 1 ? p.amountMinor : null,
        },
      ];
    }
    // Payments for this hire that settled before this one: the first carries the hiring fee.
    const paymentIndex = allPayments.filter(
      (o) =>
        o.id !== p.id &&
        isPaid(o) &&
        orderProposalIds(o.raw as Record<string, unknown> | null).includes(r.proposalId) &&
        Boolean(o.paidAt && p.paidAt) &&
        (o.paidAt!.getTime() < p.paidAt!.getTime() || (o.paidAt!.getTime() === p.paidAt!.getTime() && o.orderId < p.orderId)),
    ).length;
    return hireInvoiceLines({
      who: r.who,
      roleTitle: offer.roleTitle,
      projectName: r.projectName ?? "Project",
      offer,
      monthly,
      paymentIndex,
      chargedMinor: rows.length === 1 ? p.amountMinor : null,
    });
  });

  return {
    number: displayInvoiceNumber(p, legacyPaid),
    description: `Intern hiring services${monthly ? " - monthly instalment" : ""}`,
    monthly,
    lines,
    hireNames: rows.map((r) => r.who),
    projects: Array.from(new Set(rows.map((r) => r.projectName ?? "Project"))),
  };
}
