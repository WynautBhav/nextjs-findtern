import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, desc, eq, ne, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { PageHead } from "@/components/app/primitives";
import { ProjectsManager, type EmployerProject, type ProjectCounts } from "@/components/employer/projects-manager";
import { employerProjectColumns } from "./_company";

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
  // The dashboard's "New project" links here with ?new=1; posting is its own page now.
  if ((await searchParams).new === "1") redirect("/employer/projects/new");

  let rows: EmployerProject[] = [];
  const counts: Record<string, ProjectCounts> = {};
  try {
    const db = getDb();
    const p = schema.proposals;
    const c = schema.employerCartItems;
    const [projectRows, proposalRows, shortlistRows] = await Promise.all([
      db.select(employerProjectColumns).from(schema.projects).where(eq(schema.projects.employerId, employerId)).orderBy(desc(schema.projects.createdAt)),
      db
        .select({
          projectId: p.projectId,
          sent: sql<number>`count(*)::int`,
          hired: sql<number>`count(*) filter (where ${p.status} = 'hired')::int`,
        })
        .from(p)
        .where(and(eq(p.employerId, employerId), ne(p.status, "draft")))
        .groupBy(p.projectId),
      db
        .select({ projectId: c.projectId, n: sql<number>`count(distinct ${c.internId})::int` })
        .from(c)
        .where(and(eq(c.employerId, employerId), eq(c.listType, "cart")))
        .groupBy(c.projectId),
    ]);
    rows = projectRows;
    const at = (id: string) => (counts[id] ??= { shortlisted: 0, proposals: 0, hired: 0 });
    for (const r of proposalRows) Object.assign(at(r.projectId), { proposals: r.sent, hired: r.hired });
    for (const r of shortlistRows) at(r.projectId).shortlisted = r.n;
  } catch (err) {
    console.error("Failed to load employer projects:", err);
    // A failed query is not "no projects": say so, and offer no way to post a duplicate.
    return (
      <div>
        <PageHead title="Projects" />
        <LoadError what="your projects" retryHref="/employer/projects" email={SITE.adminEmail} />
      </div>
    );
  }

  return <ProjectsManager initialProjects={rows} counts={counts} />;
}
