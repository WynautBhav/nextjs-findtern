import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { hiredInternIds } from "@/lib/employer-visibility";
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
  await requireEmployerSetup(session.uid);
  const employerId = session.uid;

  let proposals: ProposalItem[] = [];

  try {
    const db = getDb();
    const rows = await db
      // Only the identity columns the list renders. Selecting the whole
      // `users` row shipped every candidate's password hash, email and phone
      // to the browser in the RSC payload.
      .select({
        proposal: schema.proposals,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        project: schema.projects,
      })
      .from(schema.proposals)
      .leftJoin(schema.users, eq(schema.proposals.internId, schema.users.id))
      .leftJoin(
        schema.projects,
        eq(schema.proposals.projectId, schema.projects.id)
      )
      .where(eq(schema.proposals.employerId, employerId))
      .orderBy(desc(schema.proposals.createdAt));

    // Unmask on a hire with this employer on any project, as every other
    // employer screen does; email leaves the server only for those.
    const hired = await hiredInternIds(db, employerId);
    proposals = rows.map((row) => {
      const unlocked = hired.has(row.proposal.internId);
      return {
        proposal: row.proposal,
        project: row.project,
        internHired: unlocked,
        user:
          row.firstName === null && row.lastName === null
            ? null
            : {
                firstName: row.firstName ?? "",
                lastName: row.lastName ?? "",
                email: unlocked ? row.email : null,
              },
      };
    });
  } catch {
    // Database fallback
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proposals"
        subtitle="Track and manage hiring proposals sent to candidates - review statuses, withdraw active offers, or proceed to onboarding."
      />

      {/* The manager copies its props into state (for optimistic withdraws),
          so a changed server list must remount it - otherwise a refresh or a
          revisit after sending shows the stale list without the new proposal. */}
      <ProposalsManager
        key={proposals.map((p) => `${p.proposal.id}:${p.proposal.status}`).join("|")}
        initialProposals={proposals}
        employerId={employerId}
      />
    </div>
  );
}
