import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { projectFromRecord } from "@/lib/employer-onboarding";
import { isEditableByEmployer, normalizeStatus } from "@/lib/projects/lifecycle";
import { ProjectForm } from "../../project-form";
import { TakedownBanner } from "@/components/employer/takedown-banner";
import { isTakenDown } from "@/lib/projects/takedown-guard";

export const metadata: Metadata = { title: "Edit project", robots: { index: false, follow: false } };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("employer");
  const { id } = await params;
  const db = getDb();
  const [[project], [company]] = await Promise.all([
    db.select().from(schema.projects).where(and(eq(schema.projects.id, id), eq(schema.projects.employerId, session.uid))).limit(1),
    db
      .select({ companyName: schema.employers.companyName, state: schema.employers.state, city: schema.employers.city })
      .from(schema.employers)
      .where(eq(schema.employers.id, session.uid))
      .limit(1),
  ]);
  if (!project) notFound();
  const published = normalizeStatus(project.status) === "published";
  // A taken-down project opens read-only whatever its status: the owner may look at it and contact admin.
  const down = isTakenDown(project);
  if (!down && !published && !isEditableByEmployer(project.status)) notFound();
  return (
    <div className="space-y-6">
      <PageHeader title={down ? "View project" : "Edit project"} />
      <TakedownBanner projects={down ? [{ id: project.id, name: project.projectName, reason: project.takenDownReason }] : []} />
      <ProjectForm
        employerId={session.uid}
        projectId={project.id}
        initial={projectFromRecord(project)}
        companyName={company?.companyName}
        companyPlace={company ? { city: company.city, state: company.state } : undefined}
        lockedFields={published}
        readOnly={down}
      />
    </div>
  );
}
