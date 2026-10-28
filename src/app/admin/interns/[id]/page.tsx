import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq, getTableColumns, inArray } from "drizzle-orm";

import { ContactEditor } from "@/components/admin/contact-editor";
import { ViewAsButton } from "@/components/admin/view-as-button";
import { AccountActiveCell, InternApprovalCell, InternVisibilityCell } from "@/components/admin/intern-row-controls";
import { Intern360View } from "@/components/admin/intern-360-view";
import { redactIdentity } from "@/lib/admin/identity-mask";
import { AdminLoadError, AdminPageHeader } from "@/components/admin/panel";
import { getSession } from "@/lib/auth";
import { canViewAs } from "@/lib/admin/impersonation";
import { allows } from "@/lib/admin/permissions";
import { listCandidateDocuments } from "@/lib/admin/candidate-documents-list";
import { getDb, schema, withoutPassword } from "@/lib/db";

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

export default async function AdminInternDetail({
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
  try {
    data = await load(id);
  } catch (err) {
    console.error("[admin/interns/[id]] load failed", err);
    return (
      <div>
        <AdminPageHeader title="Candidate" />
        <div className="apple-panel bg-white">
          <AdminLoadError what="this candidate" retryHref={`/admin/interns/${encodeURIComponent(id)}`} />
        </div>
      </div>
    );
  }
  if (!data) notFound();

  const { user, onboarding, documents, ...rest } = data;
  const viewAs = await canViewAs(session?.uid, session?.permissions);
  const canWrite = allows(session?.permissions, ["interns:write"]);
  const extra = (onboarding?.extraData ?? {}) as Record<string, unknown>;

  return (
    <Intern360View
      user={user}
      // Aadhaar, PAN and the bank account leave the server as their last four (QA-003).
      onboarding={onboarding ? redactIdentity(onboarding) : null}
      documents={listCandidateDocuments(documents, extra)}
      hasPhoto={Boolean(documents?.profilePhotoName)}
      initialTab={typeof tab === "string" ? tab : undefined}
      {...rest}
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
          {viewAs ? <ViewAsButton targetType="intern" targetId={user.id} label="View as candidate" /> : null}
        </>
      }
      controls={
        canWrite ? (
          <div key="controls" className="flex flex-wrap items-start gap-x-8 gap-y-4">
            {onboarding ? (
              <div key="review">
                <p className="mb-1.5 text-xs font-medium text-ink-600">Review</p>
                <InternApprovalCell internId={user.id} value={String(extra.approvalStatus ?? "Pending")} />
              </div>
            ) : null}
            <div key="visibility">
              <p className="mb-1.5 text-xs font-medium text-ink-600">Employer visibility</p>
              <InternVisibilityCell internId={user.id} live={user.profileVisibility !== "hidden"} />
            </div>
            <div key="account">
              <p className="mb-1.5 text-xs font-medium text-ink-600">Account</p>
              <AccountActiveCell id={user.id} kind="intern" active={user.isActive} />
            </div>
          </div>
        ) : null
      }
    />
  );
}

async function load(id: string) {
  const db = getDb();
  const [user] = await db.select(withoutPassword(getTableColumns(schema.users))).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!user) return null;

  const [[onboarding], [documents], interviews, proposals, timesheets, payouts, [paidFee]] = await Promise.all([
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

  const employerIds = [...new Set([...proposals.map((p) => p.employerId), ...interviews.map((i) => i.employerId), ...timesheets.map((t) => t.employerId)].filter(Boolean))];
  const projectIds = [...new Set([...proposals.map((p) => p.projectId), ...interviews.map((i) => i.projectId)].filter((v): v is string => Boolean(v)))];
  const [employers, projects] = await Promise.all([
    employerIds.length
      ? db.select({ id: schema.employers.id, name: schema.employers.companyName }).from(schema.employers).where(inArray(schema.employers.id, employerIds))
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
    employerNames: Object.fromEntries(employers.map((e) => [e.id, e.name])),
    projectNames: Object.fromEntries(projects.map((p) => [p.id, p.name])),
    feePaid: Boolean(paidFee) || payment.isPaid === true,
    profileComplete: Boolean(
      onboarding &&
        (onboarding.bio?.trim() ||
          onboarding.linkedinUrl?.trim() ||
          onboarding.city?.trim() ||
          (Array.isArray(onboarding.skills) && onboarding.skills.length) ||
          typeof onboarding.hasLaptop === "boolean"),
    ),
  };
}
