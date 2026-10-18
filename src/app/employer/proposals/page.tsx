import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import {
  ProposalsManager,
  type ProposalItem,
} from "@/components/employer/proposals-manager";

export const metadata: Metadata = {
  title: "Proposals",
  robots: { index: false, follow: false },
};

export default async function EmployerProposalsPage() {
  const session = await requireRole("employer");
  const employerId = session.uid;

  let proposals: ProposalItem[] = [];

  try {
    const db = getDb();
    const rows = await db
      .select({
        proposal: schema.proposals,
        user: schema.users,
        onboarding: schema.internOnboarding,
        project: schema.projects,
      })
      .from(schema.proposals)
      .leftJoin(schema.users, eq(schema.proposals.internId, schema.users.id))
      .leftJoin(
        schema.internOnboarding,
        eq(schema.proposals.internId, schema.internOnboarding.userId)
      )
      .leftJoin(
        schema.projects,
        eq(schema.proposals.projectId, schema.projects.id)
      )
      .where(eq(schema.proposals.employerId, employerId))
      .orderBy(desc(schema.proposals.createdAt));

    proposals = rows;
  } catch {
    // Database fallback
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proposals"
        subtitle="Track and manage hiring proposals sent to candidates - review statuses, withdraw active offers, or proceed to onboarding."
      />

      <ProposalsManager
        initialProposals={proposals}
        employerId={employerId}
      />
    </div>
  );
}
