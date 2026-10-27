import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { EmptyScene } from "@/components/app/primitives";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectsManager } from "@/components/employer/projects-manager";
import { timezoneForLocation } from "@/lib/timezones";

export const metadata: Metadata = {
  title: "Projects",
  robots: { index: false, follow: false },
};

export default async function EmployerProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string | string[] }>;
}) {
  const session = await requireRole("employer");
  const employerId = session.uid;
  const { new: openNew } = await searchParams;

  let rows: (typeof schema.projects.$inferSelect)[] = [];
  let company: { country: string | null; state: string | null; city: string | null } | undefined;
  try {
    const db = getDb();
    [rows, [company]] = await Promise.all([
      db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.employerId, employerId))
        .orderBy(desc(schema.projects.createdAt)),
      db
        .select({ country: schema.employers.country, state: schema.employers.state, city: schema.employers.city })
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
        <EmptyScene
          art
          title="Couldn't load your projects"
          body="Something went wrong on our side while loading your projects. Nothing is lost - reload the page in a moment."
          who="Us - a connection issue"
        />
      </div>
    );
  }

  return (
    <ProjectsManager
      employerId={employerId}
      initialProjects={rows}
      defaultTimezone={timezoneForLocation(company ?? {})}
      companyPlace={company ? { city: company.city, state: company.state } : undefined}
      openNew={openNew === "1"}
    />
  );
}
