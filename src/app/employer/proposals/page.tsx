import type { Metadata } from "next";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { Send } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { kickProposalExpiry } from "@/lib/proposal-expiry-kick";
import { hiredInternIds } from "@/lib/employer-visibility";
import { avatarUrl } from "@/lib/employer-pool";
import { initialsOf } from "@/lib/employer-candidates";
import { presenceOf, type PresenceLabel } from "@/lib/presence";
import { toEmployerProposal } from "@/lib/employer-proposal-view";
import { PageHead } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { ButtonLink } from "@/components/ui/button";
import { HireFlow } from "@/components/employer/hire-flow";
import { ProposalTabs } from "@/components/employer/section-tabs";
import { hireFlowCountsFor, internExtraForRequest, openOrdersForRequest, stateForRow } from "@/lib/employer-flow";
import { tabFromParam } from "@/components/employer/proposal-tabs";
import { ProposalsManager, type ProposalItem } from "@/components/employer/proposals-manager";
import { perfScope } from "@/lib/perf/timing";

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

async function loadList(employerId: string): Promise<{ proposals: ProposalItem[]; loadFailed: boolean }> {
  try {
    const db = getDb();
    // First wave: the list, who is hired (to unmask) and the open orders, all independent.
    const [rows, hired, openOrders] = await Promise.all([
      db
        // Only the identity columns the list renders. Selecting the whole
        // `users` row shipped every candidate's password hash, email and phone
        // to the browser in the RSC payload.
        .select({
          proposal: schema.proposals,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          projectId: schema.projects.id,
          projectName: schema.projects.projectName,
          takenDownAt: schema.projects.takenDownAt,
        })
        .from(schema.proposals)
        .leftJoin(schema.users, eq(schema.proposals.internId, schema.users.id))
        .leftJoin(schema.projects, eq(schema.proposals.projectId, schema.projects.id))
        .where(eq(schema.proposals.employerId, employerId))
        .orderBy(desc(schema.proposals.createdAt)),
      // Unmask on a hire with this employer on any project, as every other employer screen does.
      hiredInternIds(db, employerId),
      openOrdersForRequest(employerId),
    ]);
    // Photo and presence show before hire (owner call, 6 Nov); the name stays initials.
    const internIds = [...new Set(rows.map((r) => r.proposal.internId))];
    // Second wave: the CGPA gate's input (the intern's extra_data never leaves the server: only the derived gate goes
    // to the list), the photo lookup and presence, all keyed on the same ids.
    const [extraByIntern, docs, presence] = await Promise.all([
      internExtraForRequest(internIds),
      internIds.length > 0
        ? db
            .select({ userId: schema.internDocuments.userId })
            .from(schema.internDocuments)
            .where(and(inArray(schema.internDocuments.userId, internIds), isNotNull(schema.internDocuments.profilePhotoName)))
            // Photos are decoration: a failed lookup shows initials, not an error page.
            .catch(() => [])
        : [],
      // presenceOf takes at most 200 ids; the rest simply show no dot.
      internIds.length > 0 ? presenceOf(internIds.slice(0, 200)).catch((): Record<string, PresenceLabel | null> => ({})) : ({} as Record<string, PresenceLabel | null>),
    ]);
    const ctx = { openOrders, extraByIntern };
    const withPhoto = new Set<string>(docs.map((d) => d.userId));
    const proposals = rows.map((row) => ({
      proposal: toEmployerProposal(row.proposal),
      gate: stateForRow(row.proposal, ctx).state.gate,
      hasOpenOrder: ctx.openOrders.has(row.proposal.id),
      project: row.projectId ? { id: row.projectId, projectName: row.projectName ?? "Project", ...(row.takenDownAt ? { takenDown: true } : {}) } : null,
      internHired: hired.has(row.proposal.internId),
      photoUrl: withPhoto.has(row.proposal.internId) ? avatarUrl(row.proposal.internId) : null,
      presence: presence[row.proposal.internId] ?? null,
      user: userFor(row.firstName, row.lastName, hired.has(row.proposal.internId)),
    }));
    return { proposals, loadFailed: false };
  } catch (err) {
    console.error("[employer/proposals] load failed", err);
    return { proposals: [], loadFailed: true };
  }
}

async function EmployerProposalsPageImpl({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  // The dashboard's figures and the hire strip open a tab here (?status=open|draft|verifying|accepted|viewonly|hired|closed).
  const initialStatus = tabFromParam((await searchParams).status);
  const session = await requireRole("employer");
  kickProposalExpiry(); // queued after the response; throttled to one sweep per 10 minutes
  const employerId = session.uid;

  // The setup check (it redirects), the hire-flow strip and the list's own reads are independent: started together,
  // so the page costs a few round trips in total instead of one per read. `loadList` never throws.
  const [, flow, list] = await Promise.all([requireEmployerSetup(employerId), hireFlowCountsFor(employerId), loadList(employerId)]);
  const { proposals, loadFailed } = list;

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
        className="mb-4 lg:mb-5"
      />
      <ProposalTabs active="proposals" proposals={flow?.proposals} />
      {/* No step is lit here: the tabs below are the stages (Waiting, Verifying, To pay, Hired), and the strip links into them. */}
      {flow ? <HireFlow counts={flow} current={null} /> : null}

      {loadFailed ? (
        <LoadError what="your proposals" retryHref="/employer/proposals" email={SITE.adminEmail} />
      ) : (
        // The manager copies its props into state (for optimistic withdraws),
        // so a changed server list must remount it.
        <ProposalsManager
          key={proposals.map((p) => `${p.proposal.id}:${p.proposal.status}:${p.gate?.state ?? ""}`).join("|")}
          initialProposals={proposals}
          initialStatus={initialStatus}
        />
      )}
    </div>
  );
}

export default function EmployerProposalsPage(props: Parameters<typeof EmployerProposalsPageImpl>[0]) {
  return perfScope("employer/proposals", () => EmployerProposalsPageImpl(props));
}
