import { displayInvoiceNumber, LEGACY_INVOICE_CUTOFF, legacyInvoiceNumbers, type InvoiceLine } from "./invoice.ts";
import { hireInvoiceLines } from "./invoice-lines.ts";
import { formatMoney } from "./format.ts";
import { parseOffer } from "./offer.ts";
import { orderProposalIds } from "./order-ids.ts";
import { discountLabel, paymentPromo } from "./admin/payment-promo.ts";

/**
 * The one place an employer payment becomes an invoice number, a description
 * its lines and its promo note. The employer's Orders page and the admin ledger
 * both call `employerInvoices` (one batch, linear in the payments) or
 * `employerInvoice` (one payment), so the two copies cannot drift apart.
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

export type EmployerInvoice = {
  number: string;
  description: string;
  monthly: boolean;
  lines: InvoiceLine[];
  hireNames: string[];
  projects: string[];
  /** The promo note the invoice prints (code, or legacy "Discount (10%)"); null when none. */
  promo: { code: string; discountMinor: number | null } | null;
};

type Input = {
  /** The payments to look for this hire's earlier instalments in (at least this employer's). */
  allPayments: readonly InvoicePayment[];
  /** Paid refs of EVERY employer payment that gets a legacy DDMMYY-NN number (see `needsLegacyNumber`): the NN counts them all. */
  legacyPaid: readonly { orderId: string; paidAt: Date | string | null }[];
  hires: ReadonlyMap<string, InvoiceHire>;
};

/** Everything that is the same for every payment, computed once. */
function prepare({ allPayments, legacyPaid, hires }: Input) {
  const legacyNumbers = legacyInvoiceNumbers(legacyPaid);
  // proposal id -> paid payments covering it, so "earlier instalments" is a short scan, not all payments.
  const paidByProposal = new Map<string, InvoicePayment[]>();
  for (const o of allPayments) {
    if (!isPaid(o) || !o.paidAt) continue;
    for (const id of new Set(orderProposalIds(o.raw as Record<string, unknown> | null))) {
      const list = paidByProposal.get(id);
      if (list) list.push(o);
      else paidByProposal.set(id, [o]);
    }
  }
  return (p: InvoicePayment): EmployerInvoice => build(p, hires, legacyNumbers, paidByProposal, legacyPaid);
}

function build(
  p: InvoicePayment,
  hires: ReadonlyMap<string, InvoiceHire>,
  legacyNumbers: ReadonlyMap<string, { number: string; paidAtMs: number }>,
  paidByProposal: ReadonlyMap<string, readonly InvoicePayment[]>,
  legacyPaid: Input["legacyPaid"],
): EmployerInvoice {
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
    const paymentIndex = (paidByProposal.get(r.proposalId) ?? []).filter(
      (o) =>
        o.id !== p.id &&
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

  const hit = needsLegacyNumber(p) ? legacyNumbers.get(p.orderId) : undefined;
  const number = hit && p.paidAt && hit.paidAtMs === p.paidAt.getTime() ? hit.number : displayInvoiceNumber(p, legacyPaid);

  const promoFacts = paymentPromo(p.raw, undefined, p.amountMinor);
  const promoCode = discountLabel(promoFacts, p.amountMinor);

  return {
    number,
    description: `Intern hiring services${monthly ? " - monthly instalment" : ""}`,
    monthly,
    lines,
    hireNames: rows.map((r) => r.who).filter(Boolean),
    projects: Array.from(new Set(rows.map((r) => r.projectName ?? "Project"))),
    promo: promoCode ? { code: promoCode, discountMinor: promoFacts.discountMinor || null } : null,
  };
}

/** One payment's invoice. Prefer `employerInvoices` for a list: it prepares the shared lookups once. */
export function employerInvoice(input: Input & { payment: InvoicePayment }): EmployerInvoice {
  return prepare(input)(input.payment);
}

/** The invoices of many payments at once, keyed by payment id. Linear in the number of payments. */
export function employerInvoices(input: Input & { payments: readonly InvoicePayment[] }): Map<string, EmployerInvoice> {
  const make = prepare(input);
  const out = new Map<string, EmployerInvoice>();
  for (const p of input.payments) out.set(p.id, make(p));
  return out;
}
