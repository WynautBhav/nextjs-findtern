import type { Metadata } from "next";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { invoiceBuyerOf } from "@/lib/invoice-buyer";
import { PageHead } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import {
  OrdersManager,
  type HireRow,
  type InvoiceRow,
} from "@/components/employer/orders-manager";
import { placementLedger } from "@/lib/dues";
import { placeOfSupply } from "@/lib/gst";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { LEGACY_INVOICE_CUTOFF, taxInvoiceHtml } from "@/lib/invoice";
import { employerInvoices } from "@/lib/employer-invoice";
import { loadInvoiceHires } from "@/lib/employer-invoice-hires";
import { timezoneForLocation } from "@/lib/timezones";
import { parseOffer, todayIst } from "@/lib/offer";
import { payableCheckout } from "@/lib/employer-payable";
import { expireStaleEmployerOrders } from "@/lib/payments";
import { isPaidRow } from "@/lib/admin/invoice-rows";

export const metadata: Metadata = {
  title: "Orders",
  robots: { index: false, follow: false },
};

/**
 * Orders.
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
  await requireEmployerSetup(employerId);
  const data = await loadOrders(employerId).catch((err) => {
    console.error("Failed to load employer orders data:", err);
    return null;
  });
  if (!data) {
    return (
      <div>
        <PageHead title="Orders" />
        <LoadError what="your orders" retryHref="/employer/orders" email={SITE.adminEmail} />
      </div>
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
  const nameOf = (r: (typeof proposalRows)[number]) => `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Candidate";
  // The same hire loader and batch builder the admin ledger uses.
  const hiresById = await loadInvoiceHires(db, paymentRows);

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
        // The hiring fee is inside the total; a full-time hire's whole charge is its fee.
        feeMinor: ledger.feeMinor,
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
  const paidPayments = paymentRows.filter((p) => isPaidRow(p) && p.amountMinor > 0);
  const built = employerInvoices({ payments: paidPayments, allPayments: paymentRows, legacyPaid: paidRefs, hires: hiresById });
  const invoices: InvoiceRow[] = paidPayments
    .map((p) => {
      const inv = built.get(p.id)!;
      const { number, lines } = inv;
      const currency = p.currency || "INR";
      return {
        id: p.id,
        number,
        orderId: p.orderId,
        paymentId: p.paymentId,
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        amountMinor: p.amountMinor,
        currency,
        candidates: inv.hireNames,
        projects: inv.projects,
        html: taxInvoiceHtml({
          invoiceNo: number,
          date: p.paidAt ?? new Date(),
          orderId: p.orderId,
          paymentId: p.paymentId,
          currency,
          amountMinor: p.amountMinor,
          description: inv.description,
          lines: lines.length ? lines : undefined,
          promo: inv.promo,
          seller,
          buyer: { ...invoiceBuyerOf(p.raw, employer), place: placeOfSupply({ ...invoiceBuyerOf(p.raw, employer), currency }) },
        }),
      };
    });

  // A line is due once its day has come (accepted offers have no day); a post-paid month inside its pay window is only open early.
  const today = todayIst();
  const dueNow = payable?.lines.filter((l) => !l.dueOn || l.dueOn <= today).length ?? 0;
  return { fteStatus, timezone, hires, invoices, payableCount: dueNow, earlyCount: (payable?.lines.length ?? 0) - dueNow, offersToPay: payable?.lines.filter((l) => !l.due).length ?? 0, payableIds: payable?.lines.map((l) => l.id) ?? [] };
}
