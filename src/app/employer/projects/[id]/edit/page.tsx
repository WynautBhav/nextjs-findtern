import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { projectFromRecord } from "@/lib/employer-onboarding";
import { isEditableByEmployer, normalizeStatus } from "@/lib/projects/lifecycle";
import { ProjectForm } from "../../project-form";

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
  if (!published && !isEditableByEmployer(project.status)) notFound();
  return (
    <div className="container-page section-y space-y-6">
      <PageHeader title="Edit project" />
      <ProjectForm
        employerId={session.uid}
        projectId={project.id}
        initial={projectFromRecord(project)}
        companyName={company?.companyName}
        companyPlace={company ? { city: company.city, state: company.state } : undefined}
        lockedFields={published}
      />
    </div>
  );
}
