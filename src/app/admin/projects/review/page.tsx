import { asc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { ReviewQueue, type QueueItem } from "./review-queue";

export const dynamic = "force-dynamic";

export default async function ProjectReviewPage() {
  let items: QueueItem[] | null = null;
  try {
    const rows = await getDb()
      .select({
        id: schema.projects.id,
        projectName: schema.projects.projectName,
        scopeOfWork: schema.projects.scopeOfWork,
        skills: schema.projects.skills,
        locationType: schema.projects.locationType,
        fullTimeOffer: schema.projects.fullTimeOffer,
        submittedAt: schema.projects.submittedAt,
        companyName: schema.employers.companyName,
      })
      .from(schema.projects)
      .innerJoin(schema.employers, eq(schema.employers.id, schema.projects.employerId))
      .where(sql`${schema.projects.status} = 'pending_review'`)
      .orderBy(asc(schema.projects.submittedAt))
      .limit(100);
    items = rows.map((r) => ({
      id: r.id,
      projectName: r.projectName,
      company: r.companyName ?? "Unknown company",
      scopeOfWork: r.scopeOfWork,
      skills: (r.skills as string[] | null) ?? [],
      locationType: r.locationType,
      fullTimeOffer: Boolean(r.fullTimeOffer),
      submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    }));
  } catch (error) {
    console.error("[admin/projects/review]", error);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Internship review" subtitle="Postings waiting for approval, oldest first." />
      {items ? (
        <ReviewQueue initial={items} />
      ) : (
        <Panel>
          <AdminLoadError what="the review queue" retryHref="/admin/projects/review" />
        </Panel>
      )}
    </div>
  );
}
