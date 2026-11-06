import type { Metadata } from "next";
import { eq, desc, getTableColumns } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectsManager, type EmployerProject } from "@/components/employer/projects-manager";
import { timezoneForLocation } from "@/lib/timezones";

export const metadata: Metadata = {
  title: "Projects",
  robots: { index: false, follow: false },
};

// Every column but takenDownBy: an admin's id never goes to the employer's browser.
const { takenDownBy: _adminId, ...employerProjectColumns } = getTableColumns(schema.projects);
void _adminId;

export default async function EmployerProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string | string[] }>;
}) {
  const session = await requireRole("employer");
  const employerId = session.uid;
  const { new: openNew } = await searchParams;

  let rows: EmployerProject[] = [];
  let company: { companyName: string | null; country: string | null; state: string | null; city: string | null } | undefined;
  try {
    const db = getDb();
    [rows, [company]] = await Promise.all([
      db
        .select(employerProjectColumns)
        .from(schema.projects)
        .where(eq(schema.projects.employerId, employerId))
        .orderBy(desc(schema.projects.createdAt)),
      db
        .select({ companyName: schema.employers.companyName, country: schema.employers.country, state: schema.employers.state, city: schema.employers.city })
        .from(schema.employers)
        .where(eq(schema.employers.id, employerId))
        .limit(1),
    ]);
  } catch (err) {
    console.error("Failed to load employer projects:", err);
    // A failed query is not "no projects": say so, and don't offer a form
    // that would create a duplicate of a project we just couldn't see.
    return (
      <div>
        <PageHeader title="Projects" />
        <LoadError what="your projects" retryHref={openNew === "1" ? "/employer/projects?new=1" : "/employer/projects"} email={SITE.adminEmail} />
      </div>
    );
  }

  return (
    <ProjectsManager
      employerId={employerId}
      initialProjects={rows}
      defaultTimezone={timezoneForLocation(company ?? {})}
      companyName={company?.companyName}
      companyPlace={company ? { city: company.city, state: company.state } : undefined}
      openNew={openNew === "1"}
    />
  );
}
