import { isHiredProposal } from "@/lib/hire-status";
import type { Metadata } from "next";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";

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
import { orderRefunds } from "@/lib/refund-accounting";
import { placeOfSupply } from "@/lib/gst";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { LEGACY_INVOICE_CUTOFF, taxInvoiceHtml } from "@/lib/invoice";
import { employerInvoices } from "@/lib/employer-invoice";
import { loadInvoiceHires } from "@/lib/employer-invoice-hires";
import { hasOpenMeeting } from "@/lib/employer-interview-rules";
import { timezoneForLocation } from "@/lib/timezones";
import { parseOffer, todayIst } from "@/lib/offer";
import { payableCheckoutForRequest } from "@/lib/employer-payable";
import { expireStaleEmployerOrders } from "@/lib/payments";
import { isPaidRow } from "@/lib/admin/invoice-rows";
import { formatPeriod, payrollInvoiceHtml } from "@/lib/invoice-premium";
import { isManualInvoiceRaw } from "@/lib/payroll-invoice";
import { manualInvoiceFacts, manualInvoiceStatus, payrollInvoiceInputOf } from "@/lib/payroll-invoice-view";

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
  // The setup check runs beside the page's reads, not ahead of them (one round trip less); its redirect still wins.
  const setup = requireEmployerSetup(employerId);
  setup.catch(() => undefined);
  const [, data] = await Promise.all([
    setup,
    loadOrders(employerId).catch((err) => {
      console.error("Failed to load employer orders data:", err);
      return null;
    }),
  ]);
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
    payableCheckoutForRequest(employerId).catch(() => null),
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
  const hiredInterns = [...new Set(proposalRows.filter((r) => r.proposal.status === "hired").map((r) => r.proposal.internId))];
  // A hire keeps its Book meeting button (not on the Candidates list or shortlist any more); dimmed while a meeting is open.
  const openMeetings = hiredInterns.length
    ? await db
        .select()
        .from(schema.interviews)
        .where(and(eq(schema.interviews.employerId, employerId), inArray(schema.interviews.internId, hiredInterns), inArray(schema.interviews.status, ["pending", "scheduled"])))
    : [];
  const hires: HireRow[] = proposalRows
    .filter((r) => r.proposal.status === "hired")
    .map((r) => {
      const offer = parseOffer(r.proposal.offerDetails, r.proposal.currency);
      const ledger = placementLedger(r.proposal, paymentRows);
      return {
        proposalId: r.proposal.id,
        internId: r.proposal.internId,
        projectId: r.proposal.projectId ?? null,
        meetingOpen: hasOpenMeeting(openMeetings.filter((iv) => iv.internId === r.proposal.internId)),
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
  // A payroll invoice (raw.kind manual_invoice) is not a checkout order: it has its own branch below.
  const paidPayments = paymentRows.filter((p) => isPaidRow(p) && p.amountMinor > 0 && !isManualInvoiceRaw(p.raw));
  const built = employerInvoices({ payments: paidPayments, allPayments: paymentRows, legacyPaid: paidRefs, hires: hiresById });
  const taxInvoices: InvoiceRow[] = paidPayments
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
        refundedMinor: orderRefunds(p).refundedMinor,
        currency,
        promoCode: inv.promo?.code ?? null,
        discountMinor: inv.promo?.discountMinor ?? 0,
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

  // Payroll invoices Findtern issued for this company's own full-time hires: shown once issued (Due) and when paid;
  // a void one is hidden. The company never sees another company's, because only this employer's payments and hires are read.
  const hireByProposal = new Map(proposalRows.map((r) => [r.proposal.id, r]));
  const payrollInvoices: InvoiceRow[] = paymentRows.flatMap((p) => {
    if (!isManualInvoiceRaw(p.raw) || !p.invoiceNumber || (p.status !== "created" && p.status !== "paid")) return [];
    const facts = manualInvoiceFacts(p.raw);
    const hire = facts ? hireByProposal.get(facts.proposalId) : undefined;
    // Only while the hire stands: the intern's full name is never shown for a placement that is no longer hired.
    if (!facts || !hire || !isHiredProposal(hire.proposal)) return [];
    const offer = parseOffer(hire.proposal.offerDetails, hire.proposal.currency);
    const role = offer.roleTitle || hire.projectName || "Full-time role";
    const input = payrollInvoiceInputOf(p, { intern: { name: nameOf(hire), role }, seller, liveBuyer: employer });
    if (!input) return [];
    return [
      {
        id: p.id,
        number: p.invoiceNumber,
        orderId: p.orderId,
        paymentId: null,
        paidAt: manualInvoiceStatus(p.status) === "paid" && p.paidAt ? p.paidAt.toISOString() : null,
        amountMinor: p.amountMinor,
        currency: "USD",
        candidates: [nameOf(hire)],
        projects: [hire.projectName ?? role],
        html: payrollInvoiceHtml(input),
        payroll: { status: manualInvoiceStatus(p.status) === "paid" ? "paid" : "due", dueOn: facts.dueOn, issuedAt: input.issuedOn.toISOString(), period: formatPeriod(facts.period.start, facts.period.end) },
      } satisfies InvoiceRow,
    ];
  });
  // Newest first by the day each happened (paid, else issued); with none, the tax invoices keep their order untouched.
  const invoices = payrollInvoices.length
    ? [...taxInvoices, ...payrollInvoices].sort((a, b) => (b.paidAt ?? b.payroll?.issuedAt ?? "").localeCompare(a.paidAt ?? a.payroll?.issuedAt ?? ""))
    : taxInvoices;

  // A line is due once its day has come (accepted offers have no day); a post-paid month inside its pay window is only open early.
  const today = todayIst();
  const dueNow = payable?.lines.filter((l) => !l.dueOn || l.dueOn <= today).length ?? 0;
  return { fteStatus, timezone, hires, invoices, payableCount: dueNow, earlyCount: (payable?.lines.length ?? 0) - dueNow, offersToPay: payable?.lines.filter((l) => !l.due).length ?? 0, payableIds: payable?.lines.map((l) => l.id) ?? [] };
}
