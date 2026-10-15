import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { emptyDraft, draftFromRecord, type OnboardingDraft, type StoredDocument } from "@/lib/onboarding";
import { PageHead } from "@/components/app/primitives";
import { OnboardingForm } from "@/components/intern/onboarding-form";

export const metadata: Metadata = {
  title: "Complete your profile",
  robots: { index: false, follow: false },
};

/* Thin server shell. It reads what is already saved, hands the client form a
 * plain object, and gets out of the way - the 5,900-line legacy page was mostly
 * step state, and step state belongs on the client.
 *
 * There is no `POST /api/intern/onboarding` in this build, so nothing here
 * writes. The form says so on save rather than pretending otherwise. */

export default async function InternOnboarding() {
  const session = await getSession();
  const draft: OnboardingDraft = emptyDraft();
  let documents: StoredDocument[] = [];

  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, session!.uid))
      .orderBy(desc(schema.internOnboarding.createdAt))
      .limit(1);

    if (row) Object.assign(draft, draftFromRecord(row));

    const [record] = await db
      .select()
      .from(schema.internDocuments)
      .where(eq(schema.internDocuments.userId, session!.uid))
      .orderBy(desc(schema.internDocuments.createdAt))
      .limit(1);

    if (record) {
      documents = [
        { label: "Profile photo", fileName: record.profilePhotoName ?? "" },
        { label: "Intro video", fileName: record.introVideoName ?? "" },
        { label: "Aadhaar", fileName: record.aadhaarImageName ?? "" },
        { label: "PAN", fileName: record.panImageName ?? "" },
      ].filter((doc) => doc.fileName.length > 0);
    }
  } catch {
    // DB unavailable - render the blank form rather than crashing the page.
  }

  return (
    <div>
      <PageHead
        title="Complete your profile"
        lede="Employers shortlist on what is filled in here. Five short steps."
      />
      <OnboardingForm
        initial={draft}
        documents={documents}
        email={session!.email ?? "your account"}
      />
    </div>
  );
}