import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { OrdersManager, type HiredInternItem } from "@/components/employer/orders-manager";

export const metadata: Metadata = {
  title: "Orders & Payments",
  robots: { index: false, follow: false },
};

export default async function EmployerOrdersPage() {
  const session = await getSession();
  const employerId = session!.uid;

  let paymentRows: (typeof schema.employerPayments.$inferSelect)[] = [];
  let hiredItems: HiredInternItem[] = [];

  try {
    const db = getDb();

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

    hiredItems = proposalRows
      .filter((r) => r.proposal.status === "accepted" || r.proposal.hiredAt !== null)
      .map((r) => {
        const offer = (r.proposal.offerDetails ?? {}) as Record<string, unknown>;
        const monthlyAmount =
          typeof offer.monthlyAmount === "number"
            ? offer.monthlyAmount
            : typeof offer.hourlyRate === "number" && typeof offer.monthlyHours === "number"
            ? offer.hourlyRate * offer.monthlyHours
            : 15000;

        let durationMonths = 3;
        if (typeof offer.duration === "string") {
          const m = parseInt(offer.duration.replace(/\D/g, ""), 10);
          if (m && !isNaN(m)) durationMonths = m;
        }

        return {
          proposal: r.proposal,
          candidateName: `${r.firstName} ${r.lastName}`.trim() || "Candidate",
          candidateEmail: r.email,
          projectName: r.projectName ?? "General Project",
          monthlyStipend: monthlyAmount,
          durationMonths,
          startDate: typeof offer.startDate === "string" ? offer.startDate : undefined,
        };
      });
  } catch (err) {
    console.error("Failed to load employer orders data:", err);
  }

  return (
    <OrdersManager
      hiredCandidates={hiredItems}
      paymentHistory={paymentRows}
    />
  );
}
