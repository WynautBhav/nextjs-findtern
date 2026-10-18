import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";

import { ContactEditor } from "@/components/admin/contact-editor";
import { ViewAsButton } from "@/components/admin/view-as-button";
import { ApprovalSelect } from "@/components/admin/approval-select";
import { getDb, schema } from "@/lib/db";
import { Intern360View } from "@/components/admin/intern-360-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const db = getDb();
  const [user] = await db
    .select({ firstName: schema.users.firstName, lastName: schema.users.lastName })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);

  return {
    title: user ? `${user.firstName} ${user.lastName} · Candidate 360` : "Intern",
  };
}

export default async function AdminInternDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!user) notFound();

  const [onboarding] = await db
    .select()
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, id))
    .limit(1);

  const [documents] = await db
    .select()
    .from(schema.internDocuments)
    .where(eq(schema.internDocuments.userId, id))
    .limit(1);

  const [interviews, proposals, timesheets, payouts] = await Promise.all([
    db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.internId, id))
      .orderBy(desc(schema.interviews.createdAt)),
    db
      .select()
      .from(schema.proposals)
      .where(eq(schema.proposals.internId, id))
      .orderBy(desc(schema.proposals.createdAt)),
    db
      .select()
      .from(schema.timesheets)
      .where(eq(schema.timesheets.internId, id))
      .orderBy(desc(schema.timesheets.createdAt)),
    db
      .select()
      .from(schema.internPayouts)
      .where(eq(schema.internPayouts.internId, id))
      .orderBy(desc(schema.internPayouts.createdAt)),
  ]);

  const employerIds = Array.from(
    new Set(
      [
        ...proposals.map((p) => p.employerId),
        ...interviews.map((i) => i.employerId),
      ].filter(Boolean)
    )
  ) as string[];

  const employerNames: Record<string, string> = {};
  if (employerIds.length > 0) {
    const rows = await db
      .select({ id: schema.employers.id, companyName: schema.employers.companyName })
      .from(schema.employers)
      .where(inArray(schema.employers.id, employerIds));
    for (const r of rows) employerNames[r.id] = r.companyName;
  }

  const projectIds = Array.from(
    new Set(
      [
        ...proposals.map((p) => p.projectId),
        ...interviews.map((i) => i.projectId),
      ].filter(Boolean)
    )
  ) as string[];

  const projectNames: Record<string, string> = {};
  if (projectIds.length > 0) {
    const pRows = await db
      .select({ id: schema.projects.id, projectName: schema.projects.projectName })
      .from(schema.projects)
      .where(inArray(schema.projects.id, projectIds));
    for (const r of pRows) projectNames[r.id] = r.projectName;
  }

  return (
    <Intern360View
      user={user}
      onboarding={onboarding || null}
      documents={documents || null}
      interviews={interviews}
      proposals={proposals}
      timesheets={timesheets}
      payouts={payouts}
      employerNames={employerNames}
      projectNames={projectNames}
      actions={
        <>
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
          <ViewAsButton targetType="intern" targetId={user.id} label="View as candidate" />
          <ApprovalSelect
            internId={user.id}
            value={String(((onboarding?.extraData ?? {}) as Record<string, unknown>).approvalStatus ?? "Pending")}
          />
        </>
      }
    />
  );
}