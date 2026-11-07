import type { Metadata } from "next";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { Send } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { hiredInternIds } from "@/lib/employer-visibility";
import { avatarUrl } from "@/lib/employer-pool";
import { presenceOf, type PresenceLabel } from "@/lib/presence";
import { toEmployerProposal } from "@/lib/employer-proposal-view";
import { PageHead } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { ButtonLink } from "@/components/ui/button";
import { ProposalsManager, type ProposalItem } from "@/components/employer/proposals-manager";

export const metadata: Metadata = {
  title: "Proposals",
  robots: { index: false, follow: false },
};

/**
 * What the client list gets of the intern. Before the hire only the initials
 * leave the server (as two one-letter names), never the full name: the page's
 * RSC payload is readable in the browser.
 */
function userFor(first: string | null, last: string | null, hired: boolean): ProposalItem["user"] {
  if (first === null && last === null) return null;
  if (hired) return { firstName: first ?? "", lastName: last ?? "" };
  const initials = initialsOf(first ?? "", last ?? "");
  return { firstName: initials.charAt(0), lastName: initials.slice(1) };
}

const STATUSES = new Set(["open", "accepted", "hired", "closed"]);

export default async function EmployerProposalsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  // The dashboard's figures open a tab here (?status=open|accepted|hired|closed).
  const wanted = (await searchParams).status;
  const initialStatus = typeof wanted === "string" && STATUSES.has(wanted) ? wanted : "all";
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
    // Photo and presence show before hire (owner call, 6 Nov); the name stays initials.
    const internIds = [...new Set(rows.map((r) => r.proposal.internId))];
    const withPhoto = new Set<string>();
    let presence: Record<string, PresenceLabel | null> = {};
    if (internIds.length > 0) {
      const docs = await db
        .select({ userId: schema.internDocuments.userId })
        .from(schema.internDocuments)
        .where(and(inArray(schema.internDocuments.userId, internIds), isNotNull(schema.internDocuments.profilePhotoName)))
        // Photos are decoration: a failed lookup shows initials, not an error page.
        .catch(() => []);
      for (const d of docs) withPhoto.add(d.userId);
      // presenceOf takes at most 200 ids; the rest simply show no dot.
      presence = await presenceOf(internIds.slice(0, 200)).catch(() => ({}));
    }
    proposals = rows.map((row) => ({
      proposal: toEmployerProposal(row.proposal),
      project: row.projectId ? { id: row.projectId, projectName: row.projectName ?? "Project" } : null,
      internHired: hired.has(row.proposal.internId),
      photoUrl: withPhoto.has(row.proposal.internId) ? avatarUrl(row.proposal.internId) : null,
      presence: presence[row.proposal.internId] ?? null,
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
          <ButtonLink href="/employer/candidates" size="sm" variant="outline">
            <Send className="size-4" aria-hidden />
            Send a proposal
          </ButtonLink>
        }
      />

      {loadFailed ? (
        <LoadError what="your proposals" retryHref="/employer/proposals" email={SITE.adminEmail} />
      ) : (
        // The manager copies its props into state (for optimistic withdraws),
        // so a changed server list must remount it.
        <ProposalsManager
          key={proposals.map((p) => `${p.proposal.id}:${p.proposal.status}`).join("|")}
          initialProposals={proposals}
          initialStatus={initialStatus}
        />
      )}
    </div>
  );
}
