import type { Metadata } from "next";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { EmptyScene } from "@/components/app/primitives";
import {
  OrdersManager,
  type HireRow,
  type InvoiceRow,
} from "@/components/employer/orders-manager";
import { placementLedger } from "@/lib/dues";
import { placeOfSupply } from "@/lib/gst";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { displayInvoiceNumber, LEGACY_INVOICE_CUTOFF, taxInvoiceHtml, type InvoiceLine } from "@/lib/invoice";
import { timezoneForLocation } from "@/lib/timezones";
import { parseOffer } from "@/lib/offer";
import { payableCheckout } from "@/lib/employer-payable";
import { expireStaleEmployerOrders, orderProposalIds } from "@/lib/payments";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = {
  title: "Orders & payments",
  robots: { index: false, follow: false },
};

/**
 * Orders & payments.
 *
 * Three questions, one tab each: who have I hired (and on what terms), what
 * have I paid and what is left (legacy "Upcoming payments", per hire with
 * totals and dates), and where are my invoices (legacy payment history, with
 * candidate and project on every row). Invoices are rendered on the server,
 * so the client only receives finished HTML and never the seller's env.
 */
export default async function EmployerOrdersPage() {
  const session = await requireRole("employer");
  const employerId = session.uid;
  const data = await loadOrders(employerId).catch((err) => {
    console.error("Failed to load employer orders data:", err);
    return null;
  });
  if (!data) {
    return (
      <EmptyScene
        art
        title="Couldn't load your orders"
        body="We couldn't reach your payment records just now. Nothing has changed on your account; try again in a moment."
        who="Us - connection issue"
        next={{ label: "Try again", href: "/employer/orders" }}
      />
    );
  }
  return <OrdersManager employerId={employerId} {...data} />;
}

async function loadOrders(employerId: string) {
  const db = getDb();
  await expireStaleEmployerOrders(employerId).catch(() => 0);

  const [[employer], paymentRows, proposalRows, payable] = await Promise.all([
    db.select().from(schema.employers).where(eq(schema.employers.id, employerId)).limit(1),
    db
      .select()
      .from(schema.employerPayments)
      .where(eq(schema.employerPayments.employerId, employerId))
      .orderBy(desc(schema.employerPayments.createdAt)),
    db
      .select({
        proposal: schema.proposals,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        projectName: schema.projects.projectName,
      })
      .from(schema.proposals)
      .innerJoin(schema.users, eq(schema.proposals.internId, schema.users.id))
      .leftJoin(schema.projects, eq(schema.proposals.projectId, schema.projects.id))
      .where(eq(schema.proposals.employerId, employerId))
      .orderBy(desc(schema.proposals.createdAt)),
    payableCheckout(employerId).catch(() => null),
  ]);

  const fteStatus = employer?.internationalFteStatus ?? "none";
  const timezone = employer ? timezoneForLocation(employer) : "Asia/Kolkata";
  const buyer = {
    name: employer?.companyName ?? "Customer",
    email: employer?.companyEmail,
    gstin: employer?.gstNumber,
    country: employer?.country,
    pincode: employer?.billingPincode,
    state: employer?.state,
  };

  const byId = new Map(proposalRows.map((r) => [r.proposal.id, r]));
  const nameOf = (r: (typeof proposalRows)[number]) => `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Candidate";

  // Interns who already have a live full-time offer from this company.
  const fullTimeFor = new Set(
    proposalRows
      .filter((r) => !["rejected", "withdrawn", "expired"].includes(r.proposal.status))
      .filter((r) => parseOffer(r.proposal.offerDetails, r.proposal.currency).fullTime)
      .map((r) => r.proposal.internId),
  );

  // Hired only: an accepted-but-unpaid offer is not a hire and its name stays masked.
  const hires: HireRow[] = proposalRows
    .filter((r) => r.proposal.status === "hired")
    .map((r) => {
      const offer = parseOffer(r.proposal.offerDetails, r.proposal.currency);
      const ledger = placementLedger(r.proposal, paymentRows);
      return {
        proposalId: r.proposal.id,
        internId: r.proposal.internId,
        candidateName: nameOf(r),
        candidateEmail: r.email,
        projectName: r.projectName ?? "Project",
        roleTitle: offer.roleTitle || r.projectName || "Internship",
        fullTime: Boolean(offer.fullTime),
        annualCtcMinor: offer.fullTime?.annualCtcMinor ?? null,
        monthlyMinor: offer.monthlyMinor,
        currency: offer.currency,
        months: offer.months,
        startDate: offer.startDate,
        ledger,
        canOfferFullTime: !offer.fullTime && !fullTimeFor.has(r.proposal.internId),
      };
    });

  // Invoice numbers: legacy-era payments keep the DDMMYY-NN number their
  // customer received, which depends on every employer payment that day.
  const paidRefs = await db
    .select({ orderId: schema.employerPayments.orderId, paidAt: schema.employerPayments.paidAt })
    .from(schema.employerPayments)
    .where(
      and(
        eq(schema.employerPayments.status, "paid"),
        or(lt(schema.employerPayments.paidAt, LEGACY_INVOICE_CUTOFF), isNull(schema.employerPayments.invoiceNumber)),
      ),
    );

  const seller = getInvoiceSeller();
  // Money received only: a cancelled, failed or abandoned checkout is not an
  // invoice (bug sheet 7 S1 r135), and a ₹0 test order has nothing to bill.
  const invoices: InvoiceRow[] = paymentRows
    .filter((p) => (p.status === "paid" || p.status === "captured") && p.amountMinor > 0)
    .map((p) => {
      const ids = orderProposalIds(p.raw);
      const rows = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
      const monthly = ((p.raw as { notes?: { paymentMode?: string } } | null)?.notes?.paymentMode ?? "") === "monthly";
      const lines: InvoiceLine[] = rows.map((r) => {
        const offer = parseOffer(r.proposal.offerDetails, r.proposal.currency);
        const who = nameOf(r);
        return offer.fullTime
          ? {
              label: `${who} - Full time consulting fee (8.33% of the total mentioned CTC)`,
              detail: offer.fullTime.annualCtcMinor
                ? `${offer.roleTitle || "Full-time role"} · Annual CTC ${formatMoney(offer.fullTime.annualCtcMinor, offer.currency, { zeroLabel: false })}`
                : offer.roleTitle || null,
              amountMinor: rows.length === 1 ? p.amountMinor : null,
            }
          : {
              label: `${who} - ${offer.roleTitle || r.projectName || "Internship"}`,
              detail: `${r.projectName ?? "Project"} · ${monthly ? "Monthly instalment" : `${offer.months} month${offer.months === 1 ? "" : "s"}, paid in full`}`,
              amountMinor: rows.length === 1 ? p.amountMinor : null,
            };
      });
      const number = displayInvoiceNumber(p, paidRefs);
      const currency = p.currency || "INR";
      const promo = (p.raw as { promo?: { promoCode?: string; discountMinor?: number } } | null)?.promo;
      return {
        id: p.id,
        number,
        orderId: p.orderId,
        paymentId: p.paymentId,
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        amountMinor: p.amountMinor,
        currency,
        candidates: rows.map(nameOf),
        projects: Array.from(new Set(rows.map((r) => r.projectName ?? "Project"))),
        html: taxInvoiceHtml({
          invoiceNo: number,
          date: p.paidAt ?? new Date(),
          orderId: p.orderId,
          paymentId: p.paymentId,
          currency,
          amountMinor: p.amountMinor,
          description: `Intern hiring services${monthly ? " - monthly instalment" : ""}`,
          lines: lines.length ? lines : undefined,
          promo: promo?.promoCode ? { code: promo.promoCode, discountMinor: promo.discountMinor ?? null } : null,
          seller,
          buyer: { ...buyer, place: placeOfSupply({ ...buyer, currency }) },
        }),
      };
    });

  return { fteStatus, timezone, hires, invoices, payableCount: payable?.lines.length ?? 0 };
}
