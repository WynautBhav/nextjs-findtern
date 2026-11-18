import type { Metadata } from "next";
import { eq, desc, count } from "drizzle-orm";
import { Plus } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { proposalOutcome } from "@/lib/proposals";
import { normalizeStatus } from "@/lib/projects/lifecycle";
import { ProjectList, type ListProject } from "./project-list";
import { TakedownBanner } from "@/components/employer/takedown-banner";

export const metadata: Metadata = {
  title: "Projects",
  robots: { index: false, follow: false },
};

export default async function EmployerProjectsPage() {
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
      <div>
        <PageHeader title="Projects" />
        <LoadError what="your projects" retryHref="/employer/projects" email={SITE.adminEmail} />
      </div>
    );
  }

  const live = rows.filter((r) => normalizeStatus(r.status) === "published").length;
  const sent = rows.reduce((n, r) => n + r.sent, 0);
  const accepted = rows.reduce((n, r) => n + r.accepted, 0);
  const lede = rows.length === 0
    ? "Post a project and it goes live as soon as you submit. Pause or close it any time."
    : [
        live ? `${live} live` : "Nothing live right now",
        sent ? `${sent} proposal${sent === 1 ? "" : "s"} sent, ${accepted} accepted` : "no proposals sent yet",
      ].join(". ") + ".";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle={lede}
        action={
          <ButtonLink href="/employer/projects/new" className="max-sm:hidden">
            <Plus className="size-4" aria-hidden /> Post a project
          </ButtonLink>
        }
      />
      <TakedownBanner projects={rows.filter((r) => r.takenDown).map((r) => ({ id: r.id, name: r.projectName, reason: r.takenDownReason }))} />
      <ProjectList projects={rows} />
    </div>
  );
}
