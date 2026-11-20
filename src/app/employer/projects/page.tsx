import type { Metadata } from "next";
import { eq, desc, count } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { PageHeader } from "@/components/layout/page-header";
import { proposalOutcome } from "@/lib/proposals";
import type { ListProject } from "./project-list";
import { ProjectsView } from "./projects-view";
import { perfScope } from "@/lib/perf/timing";

export const metadata: Metadata = {
  title: "Projects",
  robots: { index: false, follow: false },
};

async function EmployerProjectsPageImpl() {
  const session = await requireRole("employer");

  let rows: ListProject[];
  try {
    const db = getDb();
    const [found, grouped] = await Promise.all([
      db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.employerId, session.uid))
        .orderBy(desc(schema.projects.createdAt)),
      db
        .select({ projectId: schema.proposals.projectId, status: schema.proposals.status, n: count() })
        .from(schema.proposals)
        .where(eq(schema.proposals.employerId, session.uid))
        .groupBy(schema.proposals.projectId, schema.proposals.status),
    ]);
    const sent = new Map<string, number>();
    const won = new Map<string, number>();
    for (const q of grouped) {
      const n = Number(q.n);
      sent.set(q.projectId, (sent.get(q.projectId) ?? 0) + n);
      if (proposalOutcome(q.status) === "won") won.set(q.projectId, (won.get(q.projectId) ?? 0) + n);
    }
    rows = found.map((p) => ({
      sent: sent.get(p.id) ?? 0,
      accepted: won.get(p.id) ?? 0,
      fullTimeOffer: Boolean(p.fullTimeOffer),
      preferredLocations: (p.preferredLocations as string[] | null) ?? [],
      id: p.id,
      projectName: p.projectName,
      status: p.status,
      scopeOfWork: p.scopeOfWork,
      skills: (p.skills as string[] | null) ?? [],
      locationType: p.locationType,
      rejectionReason: p.rejectionReason,
      takenDown: Boolean(p.takenDownAt),
      takenDownReason: p.takenDownReason,
    }));
  } catch (err) {
    console.error("Failed to load employer projects:", err);
    return (
      <div className="container-page section-y">
        <PageHeader title="Projects" />
        <LoadError what="your projects" retryHref="/employer/projects" email={SITE.adminEmail} />
      </div>
    );
  }

  return <ProjectsView rows={rows} />;
}

export default function EmployerProjectsPage() {
  return perfScope("employer/projects", () => EmployerProjectsPageImpl());
}
