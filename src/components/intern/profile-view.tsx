import { Fragment } from "react";

import type { OnboardingDraft } from "@/lib/onboarding";
import type { Completion } from "./profile/profile-logic";
import { degreeLine } from "./profile/profile-logic";
import {
  CertificationsCard,
  ContactCard,
  DocumentsCard,
  EducationCard,
  ExperienceCard,
  InterviewCard,
  LanguagesCard,
  PreferencesCard,
  ProjectsCard,
  SkillsCard,
  VisibilityCard,
} from "./profile/sections";
import { ProfileSummary, SectionNav, type ProfileStatus } from "./profile/summary";

export type { ProfileStatus };

/**
 * The candidate's profile: a summary beside a list of section cards (INT-13).
 *
 * The sections are an array of `{ id, label, node }`, so a later section (college account, visibility
 * detail) is one more entry in `extraSections`, and the "On this page" list follows without a second edit.
 * `badges` and `summaryExtra` are the two slots in the summary card (see ProfileSummary). No bio anywhere
 * (owner rule); the employer-facing row is built from the employer's own components inside Visibility.
 */

export type ProfileSection = {
  id: string;
  label: string;
  node: React.ReactNode;
};

export function ProfileView({
  name,
  initials,
  photoUrl,
  status,
  score,
  ratings,
  draft,
  aiLinks,
  completion,
  openToWork,
  contact,
  files,
  badges,
  summaryExtra,
  extraSections = [],
}: {
  /** The candidate's own name. Shown to them only; the employer row below uses `initials`. */
  name: string;
  /** Initials exactly as employers get them (`initialsOf` in lib/employer-candidates). */
  initials: string;
  photoUrl: string | null;
  status: ProfileStatus;
  score: number | null;
  ratings: [label: string, value: number][];
  draft: OnboardingDraft | null;
  aiLinks: { feedbackLink: string | null; recordingLink: string | null };
  completion: Completion;
  openToWork: boolean;
  contact: { email: string; phone: string | null; emergency: string | null };
  /** Which uploaded files exist; never the files or the numbers. */
  files: { photo: boolean; panImage: boolean; aadhaarImage: boolean };
  badges?: React.ReactNode;
  summaryExtra?: React.ReactNode;
  /** Appended after the built-in sections and before the private ones. */
  extraSections?: ProfileSection[];
}) {
  const a = draft?.academics;
  const place = draft ? [draft.city, draft.state].filter(Boolean).join(", ") : "";
  const skills = draft?.skills.filter(Boolean) ?? [];

  const sections: (ProfileSection | null)[] = [
    {
      id: "visibility",
      label: "Visibility",
      node: <VisibilityCard status={status} openToWork={openToWork} initials={initials} photoUrl={photoUrl} draft={draft} score={score} />,
    },
    ratings.length > 0 || aiLinks.feedbackLink || aiLinks.recordingLink
      ? {
          id: "interview",
          label: "AI interview",
          node: <InterviewCard ratings={ratings} aiLinks={aiLinks} />,
        }
      : null,
    draft
      ? {
          id: "preferences",
          label: "Preferences",
          node: <PreferencesCard draft={draft} />,
        }
      : null,
    draft ? { id: "skills", label: "Skills", node: <SkillsCard skills={skills} /> } : null,
    draft
      ? {
          id: "education",
          label: "Education",
          node: <EducationCard draft={draft} />,
        }
      : null,
    draft
      ? {
          id: "experience",
          label: "Experience",
          node: <ExperienceCard draft={draft} />,
        }
      : null,
    draft
      ? {
          id: "projects",
          label: "Projects",
          node: <ProjectsCard draft={draft} />,
        }
      : null,
    draft && [...(a?.professional ?? []), ...(a?.certifications ?? [])].some((q) => q.name)
      ? {
          id: "certifications",
          label: "Certifications",
          node: <CertificationsCard draft={draft} />,
        }
      : null,
    draft
      ? {
          id: "languages",
          label: "Languages",
          node: <LanguagesCard draft={draft} />,
        }
      : null,
    ...extraSections,
    {
      id: "contact",
      label: "Contact and links",
      node: <ContactCard contact={contact} linkedin={draft?.linkedinUrl ?? ""} />,
    },
    {
      id: "documents",
      label: "Documents",
      node: <DocumentsCard draft={draft} files={files} />,
    },
  ];
  const shown = sections.filter((s): s is ProfileSection => s !== null);

  return (
    <div className="grid gap-5 xl:grid-cols-[19.5rem_minmax(0,1fr)] xl:items-start xl:gap-8">
      <aside
        aria-label="Profile summary"
        className="min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:overscroll-contain xl:pr-0.5"
      >
        <ProfileSummary
          name={name}
          initials={initials}
          photoUrl={photoUrl}
          degree={a ? degreeLine(a) : ""}
          institution={a?.institution ?? ""}
          place={place}
          status={status}
          badges={badges}
          meta={summaryExtra}
          score={score}
          ratings={ratings}
          completion={completion}
          started={draft !== null}
        />
        {/* Only where there is height for it beside the card; otherwise the page itself is the list. */}
        <SectionNav sections={shown} className="mt-3 hidden xl:[@media(min-height:58rem)]:block" />
      </aside>
      <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
        {shown.map((s) => (
          <Fragment key={s.id}>{s.node}</Fragment>
        ))}
      </div>
    </div>
  );
}
