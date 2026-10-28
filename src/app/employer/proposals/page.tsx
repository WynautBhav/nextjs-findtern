import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";
import { Send } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { hiredInternIds } from "@/lib/employer-visibility";
import { EmptyScene, PageHead } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { ProposalsManager, type ProposalItem } from "@/components/employer/proposals-manager";

export const metadata: Metadata = {
  title: "Proposals",
  robots: { index: false, follow: false },
};

export default async function EmployerProposalsPage() {
  const session = await requireRole("employer");
  await requireEmployerSetup(session.uid);
  const employerId = session.uid;

  let proposals: ProposalItem[] = [];
  let loadFailed = false;

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
        projectId: schema.projects.id,
        projectName: schema.projects.projectName,
      })
      .from(schema.proposals)
      .leftJoin(schema.users, eq(schema.proposals.internId, schema.users.id))
      .leftJoin(schema.projects, eq(schema.proposals.projectId, schema.projects.id))
      .where(eq(schema.proposals.employerId, employerId))
      .orderBy(desc(schema.proposals.createdAt));

    // Unmask on a hire with this employer on any project, as every other
    // employer screen does.
    const hired = await hiredInternIds(db, employerId);
    proposals = rows.map((row) => ({
      proposal: row.proposal,
      project: row.projectId ? { id: row.projectId, projectName: row.projectName ?? "Project" } : null,
      internHired: hired.has(row.proposal.internId),
      user:
        row.firstName === null && row.lastName === null
          ? null
          : { firstName: row.firstName ?? "", lastName: row.lastName ?? "" },
    }));
  } catch (err) {
    console.error("[employer/proposals] load failed", err);
    loadFailed = true;
  }

  return (
    <div>
      <PageHead
        title="Proposals"
        action={
          <ButtonLink href="/employer/candidates" size="sm">
            <Send className="size-4" aria-hidden />
            Send a proposal
          </ButtonLink>
        }
      />

      {loadFailed ? (
        <EmptyScene
          art
          title="Couldn't load your proposals"
          body="Your offers are safe; we just couldn't reach them right now. Reload the page in a moment."
          who="Us - a connection problem"
        />
      ) : (
        // The manager copies its props into state (for optimistic withdraws),
        // so a changed server list must remount it.
        <ProposalsManager
          key={proposals.map((p) => `${p.proposal.id}:${p.proposal.status}`).join("|")}
          initialProposals={proposals}
        />
      )}
    </div>
  );
}
