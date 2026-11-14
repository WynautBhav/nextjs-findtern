import type { Metadata } from "next";
import { PencilLine } from "lucide-react";
import { eq } from "drizzle-orm";

import { PageHead } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { ProfileView, type ProfileStatus } from "@/components/intern/profile-view";
import { requireRole } from "@/lib/auth";
import { aiInterviewLinks } from "@/lib/ai-interview-links";
import { aiInterviewPhase, isScored, latestAiInterview } from "@/lib/ai-interview";
import { getDb, schema } from "@/lib/db";
import { loadInternData } from "@/lib/intern-data";
import { initialsOf } from "@/lib/employer-candidates";
import { draftFromRecord, emptyDraft, profileCompletion, type OnboardingDraft } from "@/lib/onboarding";
import { isInternPaid } from "@/lib/payments";
import { guardPrecomplete } from "@/lib/intern-precomplete";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

const RATING_LABELS: [key: string, label: string][] = [
  ["coding", "Coding"],
  ["aptitude", "Aptitude"],
  ["interview", "AI interview"],
  ["communication", "Communication"],
  ["academic", "Academics"],
];

/**
 * Your profile, as employers read it (INT-13), with the status legacy showed
 * (INT-14): "Profile live" only once activation is paid and the score is
 * published, "Profile pending" before that, "Profile hidden" while
 * open-to-work is off. The summary beside the sections holds what only the
 * candidate sees: name, completeness and the next step; the private contact
 * details and documents are the last two cards.
 */
export default async function InternProfile() {
  const session = await requireRole("intern");
  // Closed until the profile is complete (unpaid interns only); the layout's check does not run on a client-side move.
  await guardPrecomplete(session.uid, "/intern/profile");

  const data = await loadInternData(session.uid);
  const [user] = await getDb()
    .select({
      first: schema.users.firstName,
      last: schema.users.lastName,
      email: schema.users.email,
      countryCode: schema.users.countryCode,
      phone: schema.users.phoneNumber,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.uid))
    .limit(1);
  const activated = await isInternPaid(session.uid);

  // The exact initials an employer's row shows (never the full name before a hire).
  const initials = initialsOf(user?.first ?? "", user?.last ?? "");
  // Stored rows can miss whole sections; fill them so every list is an array.
  const draft: OnboardingDraft | null = data.onboarding
    ? (() => {
        const base = emptyDraft();
        const stored = draftFromRecord(data.onboarding);
        return { ...base, ...stored, academics: { ...base.academics, ...stored.academics } } as OnboardingDraft;
      })()
    : null;
  const extra = (data.onboarding?.extraData ?? {}) as Record<string, unknown>;

  const openToWork = extra.openToWork !== false;
  const scored = aiInterviewPhase(latestAiInterview(data.interviews, data.aiEmployerIds), isScored(extra)) === "scored";
  const status: ProfileStatus = !openToWork
    ? {
        tone: "closed",
        label: "Profile hidden",
        detail: "Open to work is off, so new employers can't find you. Companies you already work with still can.",
      }
    : activated && scored
      ? { tone: "live", label: "Profile live", detail: "Employers can find you in search and send you offers." }
      : {
          tone: "waiting",
          label: "Profile pending",
          detail: activated
            ? "Employers can find you once your AI interview score is published."
            : "Employers can find you once your profile is complete, activated and scored.",
        };

  const rawScore = typeof extra.findternScore === "number" ? extra.findternScore : Number(extra.findternScore);
  const score = extra.findternScore !== undefined && extra.findternScore !== null && Number.isFinite(rawScore) ? rawScore : null;
  const ratingsBag = (extra.ratings && typeof extra.ratings === "object" ? extra.ratings : {}) as Record<string, unknown>;
  const ratings = RATING_LABELS.flatMap(([key, label]) => {
    const v = ratingsBag[key];
    return typeof v === "number" && Number.isFinite(v) ? [[label, Math.max(0, Math.min(10, v))] as [string, number]] : [];
  });

  const completion = profileCompletion(data.onboarding, {
    hasPanImage: Boolean(data.document?.panImageName),
    hasAadhaarImage: Boolean(data.document?.aadhaarImageName),
    hasPhoto: Boolean(data.document?.profilePhotoName),
  });
  const aiLinks = await aiInterviewLinks(session.uid, extra);

  const emergency = draft?.emergencyPhone
    ? [
        draft.emergencyName,
        draft.emergencyRelation && `(${draft.emergencyRelation})`,
        `${draft.emergencyCountryCode ?? "+91"} ${draft.emergencyPhone}`,
      ]
        .filter(Boolean)
        .join(" ")
    : null;

  return (
    <div>
      <PageHead
        title="Your profile"
        lede="Employers search this profile, not applications. Keep it current."
        // One filled button per view: while a step is open the summary's "Continue" is it, and this one steps back.
        action={
          draft ? (
            <ButtonLink href="/intern/onboarding" variant={completion.complete ? "primary" : "outline"}>
              <PencilLine className="size-4" aria-hidden />
              Edit profile
            </ButtonLink>
          ) : undefined
        }
      />

      <ProfileView
        name={`${user?.first ?? ""} ${user?.last ?? ""}`.trim() || "Candidate"}
        initials={initials}
        photoUrl={data.document?.profilePhotoName ? "/api/intern/avatar" : null}
        status={status}
        score={score}
        ratings={ratings}
        draft={draft}
        aiLinks={aiLinks}
        completion={completion}
        openToWork={openToWork}
        contact={{
          email: user?.email ?? "",
          phone: user?.phone ? `${user.countryCode} ${user.phone}` : null,
          emergency,
        }}
        files={{
          photo: Boolean(data.document?.profilePhotoName),
          panImage: Boolean(data.document?.panImageName),
          aadhaarImage: Boolean(data.document?.aadhaarImageName),
        }}
      />
    </div>
  );
}
