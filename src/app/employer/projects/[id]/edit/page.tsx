import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ProjectEditor } from "@/components/employer/project-editor";
import { timezoneForLocation } from "@/lib/timezones";
import { employerProjectColumns, projectCompany } from "../../_company";

export const metadata: Metadata = {
  title: "Edit project",
  robots: { index: false, follow: false },
};

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("employer");
  const { id } = await params;
  // Scoped to this employer: another company's project id is simply not found.
  const [[project], company] = await Promise.all([
    getDb()
      .select(employerProjectColumns)
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.employerId, session.uid)))
      .limit(1),
    projectCompany(session.uid),
  ]);
  if (!project) notFound();
  return (
    <ProjectEditor
      employerId={session.uid}
      project={project}
      defaultTimezone={timezoneForLocation(company ?? {})}
      companyName={company?.companyName}
      companyPlace={company ? { city: company.city, state: company.state } : undefined}
    />
  );
}
