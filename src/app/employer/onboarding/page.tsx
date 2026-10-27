import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { timezoneForLocation } from "@/lib/timezones";
import { requireRole } from "@/lib/auth";
import {
  companyFromRecord,
  emptyDraft,
  missingCompanyFields,
  projectFromRecord,
  type OnboardingDraft,
} from "@/lib/employer-onboarding";
import { EmptyScene, PageHead } from "@/components/app/primitives";
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
    // A first project starts in the company's own timezone (bug sheet 26 Oct).
    else if (employer) draft.project.timezone = timezoneForLocation(employer);
  } catch (err) {
    console.error("Failed to load employer onboarding:", err);
    // Not a blank form: saving one would overwrite the profile we couldn't read.
    return (
      <div className="mx-auto max-w-4xl">
        <PageHead eyebrow="Getting set up" title="Set up your hiring account" />
        <EmptyScene
          art
          title="Couldn't load your company details"
          body="Something went wrong on our side. Nothing is lost - reload the page in a moment and carry on where you left off."
          who="Us - a connection issue"
        />
      </div>
    );
  }

  return (
    <div>
      <PageHead
        className="mx-auto max-w-4xl"
        eyebrow="Getting set up"
        title="Set up your hiring account"
        lede="Two short steps: your company, then the first role you're hiring for. Then you can browse scored candidates."
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
