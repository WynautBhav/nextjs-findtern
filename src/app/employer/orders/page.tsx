import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { OrdersManager, type HiredInternItem, type UpcomingDue } from "@/components/employer/orders-manager";
import { monthlyDues } from "@/lib/dues";
import type { InvoiceBuyerProfile } from "@/lib/gst";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { parseOffer } from "@/lib/offer";

export const metadata: Metadata = {
  title: "Orders & Payments",
  robots: { index: false, follow: false },
};

export default async function EmployerOrdersPage() {
  const session = await requireRole("employer");
  const employerId = session.uid;

  let paymentRows: (typeof schema.employerPayments.$inferSelect)[] = [];
  let hiredItems: HiredInternItem[] = [];
  let upcoming: UpcomingDue[] = [];
  /** proposalId → "Role · Project · Candidate", for itemising invoices. */
  const lineLabels: Record<string, string> = {};
  let buyer: InvoiceBuyerProfile = { name: "Customer" };
  let fteStatus = "none";

  try {
    const db = getDb();

    const [employer] = await db
      .select()
      .from(schema.employers)
      .where(eq(schema.employers.id, employerId))
      .limit(1);
    if (employer) {
      fteStatus = employer.internationalFteStatus;
      buyer = {
        name: employer.companyName,
        email: employer.companyEmail,
        gstin: employer.gstNumber,
        country: employer.country,
        pincode: employer.billingPincode,
        state: employer.state,
      };
    }

    // 1. Load payment transactions
    paymentRows = await db
      .select()
      .from(schema.employerPayments)
      .where(eq(schema.employerPayments.employerId, employerId))
      .orderBy(desc(schema.employerPayments.createdAt));

    // 2. Load hired candidate proposals (accepted or with hiredAt set)
    const proposalRows = await db
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
      .where(
        eq(schema.proposals.employerId, employerId),
      )
      .orderBy(desc(schema.proposals.createdAt));

    for (const r of proposalRows) {
      const offer = parseOffer(r.proposal.offerDetails, r.proposal.currency);
      // Paid orders only ever cover hired rows, so the name is unmasked here.
      lineLabels[r.proposal.id] = [
        offer.roleTitle || "Internship",
        r.projectName ?? "Project",
        r.proposal.status === "hired" ? `${r.firstName} ${r.lastName}`.trim() : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }

    // Interns who already have a full-time offer from this employer.
    const fullTimeFor = new Set(
      proposalRows
        .filter((r) => !["rejected", "withdrawn", "expired"].includes(r.proposal.status))
        .filter((r) => parseOffer(r.proposal.offerDetails, r.proposal.currency).fullTime)
        .map((r) => r.proposal.internId),
    );
    // Hired only. Accepted-but-unpaid offers used to land here too, which
    // both mislabelled them and unmasked their name and email before hire.
    hiredItems = proposalRows
      .filter((r) => r.proposal.status === "hired")
      .map((r) => {
        const offer = parseOffer(r.proposal.offerDetails, r.proposal.currency);

        return {
          proposal: r.proposal,
          candidateName: `${r.firstName} ${r.lastName}`.trim() || "Candidate",
          candidateEmail: r.email,
          projectName: r.projectName ?? "General Project",
          monthlyStipend: offer.monthlyMinor,
          currency: offer.currency,
          durationMonths: offer.months,
          startDate: offer.startDate ?? undefined,
          canOfferFullTime:
            r.proposal.status === "hired" &&
            !offer.fullTime &&
            !fullTimeFor.has(r.proposal.internId),
        };
      });

    // Monthly-plan placements with months still to pay. The next due date is
    // start + months already paid (the legacy rule), not "1st of next month".
    const byId = new Map(hiredItems.map((h) => [h.proposal.id, h]));
    upcoming = monthlyDues(
      proposalRows.map((r) => r.proposal),
      paymentRows,
    ).flatMap((due) => {
      const item = byId.get(due.proposalId);
      if (!item) return [];
      let nextDue: string | null = null;
      if (item.startDate) {
        const d = new Date(item.startDate);
        if (!Number.isNaN(d.getTime())) {
          d.setMonth(d.getMonth() + due.monthsPaid);
          nextDue = d.toISOString();
        }
      }
      return [{ ...item, monthsPaid: due.monthsPaid, nextDue }];
    });
  } catch (err) {
    console.error("Failed to load employer orders data:", err);
  }

  return (
    <OrdersManager
      hiredCandidates={hiredItems}
      upcomingDues={upcoming}
      lineLabels={lineLabels}
      paymentHistory={paymentRows}
      seller={getInvoiceSeller()}
      buyer={buyer}
      employerId={employerId}
      fteStatus={fteStatus}
    />
  );
}
