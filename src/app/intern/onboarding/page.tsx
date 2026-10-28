import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { emptyDraft, draftFromRecord, isOnboarded, type OnboardingDraft, type StoredDocument } from "@/lib/onboarding";
import { skillsLocked } from "@/lib/skills-lock";
import { EmptyScene, PageHead } from "@/components/app/primitives";
import { OnboardingForm } from "@/components/intern/onboarding-form";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

/* Thin server shell. It reads what is already saved, hands the client form a
 * plain object, and gets out of the way - step state belongs on the client.
 *
 * The form saves through `POST /api/intern/onboarding`. */

export default async function InternOnboarding() {
  const session = await requireRole("intern");
  const draft: OnboardingDraft = emptyDraft();
  let documents: StoredDocument[] = [];
  let serverUpdatedAt: string | null = null;
  let account: { countryCode: string; phoneNumber: string } | null = null;
  let locked = false;
  let onboarded = false;
  // Submitted once, or far enough along that skills are locked (AI interview).
  let submittedBefore = false;
  let hasPanImage = false;
  let hasAadhaarImage = false;
  let hasPhoto = false;

  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, session.uid))
      .orderBy(desc(schema.internOnboarding.createdAt))
      .limit(1);

    const [record] = await db
      .select()
      .from(schema.internDocuments)
      .where(eq(schema.internDocuments.userId, session.uid))
      .orderBy(desc(schema.internDocuments.createdAt))
      .limit(1);

    // The candidate's own number is the one captured at signup.
    const [user] = await db
      .select({ countryCode: schema.users.countryCode, phoneNumber: schema.users.phoneNumber })
      .from(schema.users)
      .where(eq(schema.users.id, session.uid))
      .limit(1);
    if (user?.phoneNumber) account = { countryCode: user.countryCode || "+91", phoneNumber: user.phoneNumber };

    if (record) {
      hasPanImage = Boolean(record.panImageName);
      hasAadhaarImage = Boolean(record.aadhaarImageName);
      hasPhoto = Boolean(record.profilePhotoName);
      documents = [
        { label: "Profile photo", fileName: record.profilePhotoName ?? "" },
        { label: "Aadhaar", fileName: record.aadhaarImageName ?? "" },
        { label: "PAN", fileName: record.panImageName ?? "" },
        { label: "Intro video", fileName: record.introVideoName ?? "" },
      ].filter((doc) => doc.fileName.length > 0);
    }

    if (row) {
      Object.assign(draft, draftFromRecord(row));
      locked = await skillsLocked(db, session.uid, row.extraData);
      serverUpdatedAt = (row.updatedAt ?? row.createdAt)?.toISOString() ?? null;
      onboarded = isOnboarded(row, { hasPanImage, hasAadhaarImage, hasPhoto });
      submittedBefore = onboarded || locked || Boolean((row.extraData as Record<string, unknown> | null)?.profileSubmittedAt);
    }

    // The upload writes intern_documents, not extra.photoUrl, so the form's
    // photo is derived from the stored avatar and survives a reload.
    if (record?.profilePhotoName) {
      const v = (record.updatedAt ?? record.createdAt)?.getTime() ?? 0;
      draft.photoUrl = `/api/intern/avatar?v=${v}`;
    }
  } catch {
    // A failed read must not look like an empty profile: saving that would
    // overwrite what is stored. Show the error instead.
    return (
      <div>
        <PageHead title="Your profile" />
        <EmptyScene
          title="We couldn't load your profile"
          body="Nothing has been changed. Reload the page in a minute; if it keeps happening, write to communicate@findtern.in."
          next={{ label: "Reload", href: "/intern/onboarding" }}
          art
        />
      </div>
    );
  }

  return (
    <div>
      <PageHead
        eyebrow={onboarded ? "Your profile" : "Set up your profile"}
        title={onboarded ? "Edit your profile" : "Complete your profile"}
        lede={
          onboarded
            ? "Changes are checked in full before they are saved, so your live profile always stays complete."
            : "Employers shortlist on what you fill in here. Eight short steps; your progress is kept as you go."
        }
      />
      <OnboardingForm
        initial={draft}
        documents={documents}
        email={session.email ?? "your account"}
        serverUpdatedAt={serverUpdatedAt}
        account={account}
        skillsLocked={locked}
        onboarded={onboarded}
        submittedBefore={submittedBefore}
        hasPanImage={hasPanImage}
        hasAadhaarImage={hasAadhaarImage}
        hasPhoto={hasPhoto}
      />
    </div>
  );
}
