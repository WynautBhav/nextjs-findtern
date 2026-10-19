import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  companyFromRecord,
  emptyDraft,
  missingCompanyFields,
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
 * Signup lands here, and the dashboard and candidate browser send an employer
 * back here until the company profile and a first project both exist
 * (lib/employer-setup). `?stage=project` opens on the project stage when only
 * that is missing.
 */

export default async function EmployerOnboarding({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string | string[] }>;
}) {
  const session = await requireRole("employer");
  const uid = session.uid;
  const { stage } = await searchParams;

  const draft: OnboardingDraft = emptyDraft();
  let companyComplete = false;
  let project: typeof schema.projects.$inferSelect | undefined;

  try {
    const db = getDb();
    const [employer] = await db
      .select()
      .from(schema.employers)
      .where(eq(schema.employers.id, uid))
      .limit(1);

    if (employer) {
      draft.company = companyFromRecord(employer);
      companyComplete = missingCompanyFields(employer).length === 0;
    }

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
        subtitle="Two short stages - finish both to start browsing candidates. Candidates only ever see what you fill in here."
      />
      <EmployerOnboardingForm
        initial={draft}
        hasExistingProject={draft.project.projectName.length > 0}
        employerId={uid}
        existingProjectId={project?.id}
        initialStage={stage === "project" && companyComplete ? 1 : 0}
      />
    </div>
  );
}
