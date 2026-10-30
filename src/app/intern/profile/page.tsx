import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, PencilLine } from "lucide-react";
import { eq } from "drizzle-orm";

import { DetailRow, PageHead, Surface } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { CompletionList } from "@/components/intern/completion-list";
import { OpenToWorkToggle } from "@/components/intern/open-to-work-toggle";
import { ProfileView, type ProfileStatus } from "@/components/intern/profile-view";
import { requireRole } from "@/lib/auth";
import { aiInterviewLinks } from "@/lib/ai-interview-links";
import { aiInterviewPhase, isScored, latestAiInterview } from "@/lib/ai-interview";
import { getDb, schema } from "@/lib/db";
import { loadInternData } from "@/lib/intern-data";
import { draftFromRecord, emptyDraft, linkedinHref, profileCompletion, type OnboardingDraft } from "@/lib/onboarding";
import { isInternPaid } from "@/lib/payments";
import { visibleAgainAt } from "@/lib/profile-hide";

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
 * open-to-work is off. The rail holds what only the candidate sees:
 * completeness, visibility and the private contact details.
 */
export default async function InternProfile() {
  const session = await requireRole("intern");

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

  const name = `${user?.first ?? ""} ${user?.last ?? ""}`.trim() || "Candidate";
  const initials = `${(user?.first ?? "").charAt(0)}${(user?.last ?? "").charAt(0)}`.toUpperCase() || "?";
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
  const visibleAgain = openToWork ? null : visibleAgainAt(extra.hiddenAt)?.toISOString() ?? null;

  const emergency = draft?.emergencyPhone
    ? [draft.emergencyName, draft.emergencyRelation && `(${draft.emergencyRelation})`, `${draft.emergencyCountryCode ?? "+91"} ${draft.emergencyPhone}`]
        .filter(Boolean)
        .join(" ")
    : null;

  return (
    <div>
      <PageHead
        title="Your profile"
        lede="This is what employers read when they consider you. Keep it current: it is the only thing they search."
        action={
          <ButtonLink href="/intern/onboarding">
            <PencilLine className="size-4" aria-hidden />
            Edit profile
          </ButtonLink>
        }
      />

      <div className="grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <ProfileView
            name={name}
            initials={initials}
            photoUrl={data.document?.profilePhotoName ? "/api/intern/avatar" : null}
            status={status}
            score={score}
            ratings={ratings}
            draft={draft}
            aiLinks={aiLinks}
          />
        </div>

        <aside className="space-y-4">
          {!completion.complete ? <CompletionList completion={completion} /> : null}

          <Surface className="p-5">
            <OpenToWorkToggle initial={openToWork} visibleAgainAt={visibleAgain} />
          </Surface>

          <Surface as="section" aria-labelledby="private-head" className="p-5">
            <h2 id="private-head" className="text-base font-semibold tracking-[-0.01em] text-ink-900">
              Only you and Findtern see this
            </h2>
            <p className="mt-1 text-sm text-ink-600">Shared with a company only after it hires you.</p>
            <dl className="mt-2 divide-y divide-ink-100">
              <DetailRow label="Email" value={<span className="break-all">{user?.email ?? "-"}</span>} />
              <DetailRow label="Phone" mono value={user?.phone ? `${user.countryCode} ${user.phone}` : "Not added"} />
              <DetailRow label="Emergency" value={emergency ?? "Not added"} />
              <DetailRow
                label="LinkedIn"
                value={
                  linkedinHref(draft?.linkedinUrl) ? (
                    <a href={linkedinHref(draft?.linkedinUrl) ?? undefined} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline touch:inline-flex touch:min-h-11 touch:items-center">
                      Open
                    </a>
                  ) : (
                    "Not added"
                  )
                }
              />
            </dl>
            <Link
              href="/intern/settings"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Change name or phone in Settings
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Surface>
        </aside>
      </div>
    </div>
  );
}
