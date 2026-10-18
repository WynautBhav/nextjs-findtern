import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { OrdersManager, type HiredInternItem } from "@/components/employer/orders-manager";
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

    // Interns who already have a full-time offer from this employer.
    const fullTimeFor = new Set(
      proposalRows
        .filter((r) => !["rejected", "withdrawn", "expired"].includes(r.proposal.status))
        .filter((r) => parseOffer(r.proposal.offerDetails, r.proposal.currency).fullTime)
        .map((r) => r.proposal.internId),
    );
    hiredItems = proposalRows
      .filter((r) => r.proposal.status === "accepted" || r.proposal.hiredAt !== null)
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
  } catch (err) {
    console.error("Failed to load employer orders data:", err);
  }

  return (
    <OrdersManager
      hiredCandidates={hiredItems}
      paymentHistory={paymentRows}
      seller={getInvoiceSeller()}
      buyer={buyer}
      employerId={employerId}
      fteStatus={fteStatus}
    />
  );
}
