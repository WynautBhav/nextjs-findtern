import { isProfileSubmittedComplete } from "@/lib/admin/profile-state";
import type { Metadata } from "next";
import { isAiInterview } from "@/lib/admin/interview-notes";
import { notFound } from "next/navigation";
import { and, desc, eq, getTableColumns, inArray } from "drizzle-orm";

import { ContactEditor } from "@/components/admin/contact-editor";
import { ViewAsButton } from "@/components/admin/view-as-button";
import { AccountActiveCell, InternApprovalCell, InternVisibilityCell } from "@/components/admin/intern-row-controls";
import { Intern360View } from "@/components/admin/intern-360-view";
import { redactIdentity } from "@/lib/admin/identity-mask";
import { AdminLoadError, AdminPageHeader } from "@/components/admin/panel";
import { AccountStandingPanel, type WorkState } from "@/components/admin/account-standing-panel";
import { loadStanding } from "@/lib/moderation/standing-db";
import { loadWorkPanel } from "@/lib/moderation/work-exempt-db";
import { getSession } from "@/lib/auth";
import { canViewAs } from "@/lib/admin/impersonation";
import { ADMIN_SURFACE } from "@/components/admin/surface";
import { allows } from "@/lib/admin/permissions";
import { listCandidateDocuments } from "@/lib/admin/candidate-documents-list";
import { loadInternActivity, type ActivityEntry } from "@/lib/admin/record-activity";
import { getDb, schema, withoutPassword } from "@/lib/db";
import { perfScope } from "@/lib/perf/timing";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const [user] = await getDb()
      .select({ firstName: schema.users.firstName, lastName: schema.users.lastName })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    return { title: user ? `${user.firstName} ${user.lastName} · Candidate 360` : "Candidate" };
  } catch {
    return { title: "Candidate" };
  }
}

async function AdminInternDetailImpl({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const tab = (await searchParams)?.tab;
  const session = await getSession();

  let data: Awaited<ReturnType<typeof load>>;
  let activities: ActivityEntry[] | null;
  // Started with the record: the permission lookup does not depend on it.
  const viewAsP = canViewAs(session?.uid, session?.permissions);
  viewAsP.catch(() => undefined); // awaited below; a failure there must not become an unhandled rejection if the load fails first
  try {
    // The timeline loads beside the record; if it throws, the page still renders without it.
    [data, activities] = await Promise.all([
      load(id),
      loadInternActivity(id).catch((err): ActivityEntry[] | null => {
        console.error("[admin/interns/[id]] activity failed", err);
        return null;
      }),
    ]);
  } catch (err) {
    console.error("[admin/interns/[id]] load failed", err);
    return (
      <div>
        <AdminPageHeader title="Candidate" />
        <div className={ADMIN_SURFACE}>
          <AdminLoadError what="this candidate" retryHref={`/admin/interns/${encodeURIComponent(id)}`} />
        </div>
      </div>
    );
  }
  if (!data) notFound();

  const { user, onboarding, documents, ...rest } = data;
  const viewAs = await viewAsP;
  const canWrite = allows(session?.permissions, ["interns:write"]);
  const extra = (onboarding?.extraData ?? {}) as Record<string, unknown>;

  const standing = await loadStanding({ type: "intern", id }).catch((err) => {
    console.error("[admin/interns/[id]] standing failed", err);
    return null;
  });

  const work = standing?.standing.frozen ? await loadWorkPanel(id).catch((err) => { console.error("[admin/interns/[id]] work panel failed", err); return null; }) : null;

  return (
    <Intern360View
      standing={
        standing ? (
          <AccountStandingPanel
            subjectType="intern"
            subjectId={user.id}
            violations={standing.standing.violations}
            frozen={standing.standing.frozen}
            frozenAt={standing.frozenAt?.toISOString() ?? null}
            pendingWarning={standing.standing.pendingWarning}
            history={standing.history.map((h) => ({ id: h.id, kind: h.kind, reason: h.reason, evidenceNote: h.evidenceNote, adminName: h.adminName, acknowledgedAt: h.acknowledgedAt?.toISOString() ?? null, createdAt: h.createdAt.toISOString() }))}
            canWrite={canWrite}
            work={work ? ((work.kind === "exempt" ? { ...work, since: work.since.toISOString() } : work) as WorkState) : undefined}
          />
        ) : null
      }
      user={user}
      // Aadhaar, PAN and the bank account leave the server as their last four (QA-003).
      onboarding={onboarding ? redactIdentity(onboarding) : null}
      documents={listCandidateDocuments(documents, extra)}
      hasPhoto={Boolean(documents?.profilePhotoName)}
      initialTab={typeof tab === "string" ? tab : undefined}
      activities={activities}
      {...rest}
      canWrite={canWrite}
      canPay={allows(session?.permissions, ["transactions:write"])}
      actions={
        <>
          {canWrite ? (
            <ContactEditor
              targetType="intern"
              targetId={user.id}
              initial={{
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                countryCode: user.countryCode,
                phoneNumber: user.phoneNumber,
              }}
            />
          ) : null}
        </>
      }
      viewAs={viewAs ? <ViewAsButton targetType="intern" targetId={user.id} label="View as candidate" appearance="tile" /> : null}
      controls={
        canWrite
          ? {
              review: onboarding ? <InternApprovalCell internId={user.id} value={String(extra.approvalStatus ?? "Pending")} /> : undefined,
              visibility: <InternVisibilityCell internId={user.id} live={user.profileVisibility !== "hidden"} />,
              account: <AccountActiveCell id={user.id} kind="intern" active={user.isActive} />,
            }
          : undefined
      }
    />
  );
}

export default function AdminInternDetail(props: Parameters<typeof AdminInternDetailImpl>[0]) {
  return perfScope("admin/interns/[id]", () => AdminInternDetailImpl(props));
}

async function load(id: string) {
  const db = getDb();
  // One wave: the user lookup no longer gates the rest (an unknown id wastes six cheap indexed reads and 404s).
  const [[user], [onboarding], [documents], interviews, proposals, timesheets, payouts, [paidFee]] = await Promise.all([
    db.select(withoutPassword(getTableColumns(schema.users))).from(schema.users).where(eq(schema.users.id, id)).limit(1),
    db.select().from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, id)).limit(1),
    db.select().from(schema.internDocuments).where(eq(schema.internDocuments.userId, id)).orderBy(desc(schema.internDocuments.createdAt)).limit(1),
    db.select().from(schema.interviews).where(eq(schema.interviews.internId, id)).orderBy(desc(schema.interviews.createdAt)),
    db.select().from(schema.proposals).where(eq(schema.proposals.internId, id)).orderBy(desc(schema.proposals.createdAt)),
    db.select().from(schema.timesheets).where(eq(schema.timesheets.internId, id)).orderBy(desc(schema.timesheets.periodStart)),
    db.select().from(schema.internPayouts).where(eq(schema.internPayouts.internId, id)).orderBy(desc(schema.internPayouts.createdAt)),
    db
      .select({ id: schema.internPayments.id })
      .from(schema.internPayments)
      .where(and(eq(schema.internPayments.internId, id), eq(schema.internPayments.status, "paid")))
      .limit(1),
  ]);
  if (!user) return null;

  const employerIds = [...new Set([...proposals.map((p) => p.employerId), ...interviews.map((i) => i.employerId), ...timesheets.map((t) => t.employerId)].filter(Boolean))];
  const projectIds = [...new Set([...proposals.map((p) => p.projectId), ...interviews.map((i) => i.projectId)].filter((v): v is string => Boolean(v)))];
  const [employers, projects] = await Promise.all([
    employerIds.length
      ? db.select({ id: schema.employers.id, name: schema.employers.companyName, email: schema.employers.companyEmail }).from(schema.employers).where(inArray(schema.employers.id, employerIds))
      : Promise.resolve([]),
    projectIds.length
      ? db.select({ id: schema.projects.id, name: schema.projects.projectName }).from(schema.projects).where(inArray(schema.projects.id, projectIds))
      : Promise.resolve([]),
  ]);

  const extra = (onboarding?.extraData ?? {}) as Record<string, unknown>;
  const payment = extra.payment && typeof extra.payment === "object" ? (extra.payment as Record<string, unknown>) : {};

  return {
    user,
    onboarding: onboarding ?? null,
    documents: documents ?? null,
    interviews,
    proposals,
    timesheets,
    payouts,
    aiInterviewIds: interviews.filter((i) => isAiInterview(i.employerId, employers.find((e) => e.id === i.employerId)?.email)).map((i) => i.id),
    employerNames: Object.fromEntries(employers.map((e) => [e.id, e.name])),
    projectNames: Object.fromEntries(projects.map((p) => [p.id, p.name])),
    feePaid: Boolean(paidFee) || payment.isPaid === true,
    // Submitted and every required onboarding field filled: the same rule as the candidates list (lib/admin/profile-state).
    profileComplete: isProfileSubmittedComplete(onboarding, {
      hasPhoto: Boolean(documents?.profilePhotoName),
      hasPanImage: Boolean(documents?.panImageName),
      hasAadhaarImage: Boolean(documents?.aadhaarImageName),
    }),
  };
}
