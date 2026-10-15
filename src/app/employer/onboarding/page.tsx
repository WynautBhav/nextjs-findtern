import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  companyFromRecord,
  emptyDraft,
  projectFromRecord,
  type OnboardingDraft,
} from "@/lib/employer-onboarding";
import { PageHeader } from "@/components/layout/page-header";
import { EmployerOnboardingForm } from "@/components/employer/onboarding-form";

export const metadata: Metadata = {
  title: "Company onboarding",
  robots: { index: false, follow: false },
};

/**
 * Two stages - company, then project.
 *
 * Collapses the legacy `company-setup.tsx` (1,247 lines) and
 * `employer-onboarding.tsx` (1,329 lines) into one page whose entire cost is the
 * two record shapes in `lib/employer-onboarding.ts`.
 *
 * Nothing here writes: there is no `PATCH /api/employer/:id` and no
 * `POST /api/employer/projects` in this build. The form says so on save.
 */

export default async function EmployerOnboarding() {
  const session = await getSession();
  const uid = session!.uid;

  const draft: OnboardingDraft = emptyDraft();
  let project: typeof schema.projects.$inferSelect | undefined;

  try {
    const db = getDb();
    const [employer] = await db
      .select()
      .from(schema.employers)
      .where(eq(schema.employers.id, uid))
      .limit(1);

    if (employer) draft.company = companyFromRecord(employer);

    // The newest project seeds stage 2. Editing an arbitrary one would imply a
    // per-row update route, which does not exist.
    const [p] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.employerId, uid))
      .orderBy(desc(schema.projects.createdAt))
      .limit(1);

    if (p) { project = p; draft.project = projectFromRecord(p); }
  } catch {
    // DB unavailable - render the blank two-stage form rather than crashing.
  }

  return (
    <div>
      <PageHeader
        title="Set up your hiring account"
        subtitle="Two short stages. Candidates only ever see what you fill in here."
      />
      <EmployerOnboardingForm
        initial={draft}
        hasExistingProject={draft.project.projectName.length > 0}
        employerId={uid}
        existingProjectId={project?.id}
      />
    </div>
  );
}
