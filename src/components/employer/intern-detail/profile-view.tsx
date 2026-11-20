import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SectionHead, Surface } from "@/components/app/primitives";
import { profileText } from "@/components/employer/profile-text";
import { WorkPreferenceList } from "@/components/employer/work-preferences";
import type { candidateStatusPill } from "@/components/employer/candidate-status";
import type { CandidateProfile } from "@/lib/employer-candidates";
import type { CandidateRelation } from "@/lib/employer-visibility";
import type { resolvePricing } from "@/lib/employer-pricing";
import type { aiInterviewLinks } from "@/lib/ai-interview-links";
import type { bandFor } from "@/lib/score";
import type { OnboardingDraft, QualificationEntry } from "@/lib/onboarding";
import type { workPreferenceRows } from "@/lib/work-preferences";
import type { PresenceLabel } from "@/lib/presence";

import { HireBar, HireRail } from "./hire-rail";
import { InternIdentityHero } from "./identity-hero";
import { CertificatesSection, EducationSection, ExperienceSection, LanguagesActivities } from "./profile-details";
import { AiInterviewSection } from "./score-tile";
import { SkillsSection } from "./skills-section";

/** What the "Send proposal" control should do for this candidate. */
export type ProposalAction =
  | { kind: "send" }
  | { kind: "view"; proposalId: string }
  | { kind: "blocked"; reason: string };

export type AppliedProject = { id: string; projectName: string | null; status: string; fullTime: boolean };

/**
 * Everything the candidate profile shows, already decided by the page: the
 * redaction (`nameUnlocked`, `displayName`), the pricing and the links. Nothing
 * here reads the database, so a fixture can render it.
 */
export type ProfileViewProps = {
  employerId: string;
  employerFte: string;
  employerZone: string;
  profile: CandidateProfile;
  nameUnlocked: boolean;
  displayName: string;
  adminContact: { email: string; phone: string } | null;
  presence: PresenceLabel | null;
  status: ReturnType<typeof candidateStatusPill>;
  statusProjectName: string | null;
  headline: string;
  linkedin: string | null;
  band: ReturnType<typeof bandFor>;
  plan: string;
  pricing: ReturnType<typeof resolvePricing>;
  currency: "INR" | "USD";
  action: ProposalAction;
  sendHref: string;
  relation: CandidateRelation | null;
  appliedProjects: AppliedProject[];
  comparePicks: string[];
  compareBlocked: string | null;
  shortlist: { projectId: string; on: boolean } | null;
  wanted: { project: string; skills: string[]; cities: string[] } | null;
  matchCount: number;
  workPreferences: ReturnType<typeof workPreferenceRows>;
  axes: { label: string; value: number | null }[];
  rated: { label: string; value: number }[];
  aiLinks: Awaited<ReturnType<typeof aiInterviewLinks>>;
  experiences: NonNullable<OnboardingDraft["experiences"]>;
  qualifications: QualificationEntry[];
  languages: NonNullable<OnboardingDraft["languages"]>;
  activities: NonNullable<OnboardingDraft["extracurriculars"]>;
};

export function ProfileView(props: ProfileViewProps) {
  const {
    employerId, employerFte, employerZone, profile, nameUnlocked, displayName, adminContact, presence, status, statusProjectName,
    headline, linkedin, band, plan, pricing, currency, action, sendHref, relation, appliedProjects, comparePicks, compareBlocked,
    shortlist, wanted, matchCount, workPreferences, axes, rated, aiLinks, experiences, qualifications, languages, activities,
  } = props;
  const academics = profile.academics;
  /** Free text with contact details hidden until hire. */
  const t = (value: string | null | undefined) => (value ? profileText(value, nameUnlocked) : "");
  /** First paint: each block rises once, a few milliseconds apart (CSS only, off under reduced motion). */
  const rise = (i: 1 | 2 | 3) => ({ className: i === 1 ? "rise [--i:1]" : i === 2 ? "rise [--i:2]" : "rise [--i:3]" });
  const hasRecording = Boolean(nameUnlocked && aiLinks.recordingLink);

  return (
    <div className="pb-44 xl:pb-12">
      <Link
        href={`/employer/candidates${shortlist ? `?project=${encodeURIComponent(shortlist.projectId)}` : ""}`}
        className="-ml-1 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm px-1 text-sm font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to candidates
      </Link>

      {adminContact ? (
        <p className="mb-6 rounded-apple-md border border-accent-300 bg-accent-100/60 px-4 py-2.5 text-sm text-ink-800">
          <span className="font-semibold">Admin view:</span>{" "}
          <a href={`mailto:${adminContact.email}`} className="underline underline-offset-4">
            {adminContact.email}
          </a>
          {adminContact.phone ? <> · {adminContact.phone}</> : null}
        </p>
      ) : null}

      {/* Left: who they are, then the evidence. Right (xl): the sticky hire rail. Below xl: hero, rail, evidence, and a floating bar for the main action. */}
      <div className="grid gap-x-12 gap-y-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 xl:col-start-1">
          <InternIdentityHero
            profile={profile}
            displayName={displayName}
            nameUnlocked={nameUnlocked}
            headline={headline}
            presence={presence}
            status={status && statusProjectName ? { tone: status.tone, label: `${statusProjectName}: ${status.label}` } : null}
            linkedin={linkedin}
            band={band}
            plan={plan}
            match={wanted && wanted.skills.length > 0 ? { hit: matchCount, of: wanted.skills.length, project: wanted.project } : null}
          />
        </div>

        {/* Fixed, so out of the grid; placed here so a keyboard reaches the main action before the evidence. */}
        <HireBar pricing={pricing} currency={currency} action={action} relation={relation} sendHref={sendHref} />

        <HireRail
          employerId={employerId}
          employerFte={employerFte}
          employerZone={employerZone}
          internId={profile.id}
          displayName={displayName}
          scored={profile.scored}
          plan={plan}
          pricing={pricing}
          currency={currency}
          action={action}
          sendHref={sendHref}
          relation={relation}
          appliedProjects={appliedProjects}
          comparePicks={comparePicks}
          compareBlocked={compareBlocked}
          shortlist={shortlist}
        />

        <div className="min-w-0 space-y-8 xl:col-start-1">
          <AiInterviewSection
            {...rise(1)}
            axes={axes}
            rated={rated}
            feedbackLink={aiLinks.feedbackLink}
            recordingLink={hasRecording ? aiLinks.recordingLink : null}
          />

          <SkillsSection {...rise(2)} skills={profile.skills} wanted={wanted} />

          <section aria-labelledby="work-h" {...rise(3)}>
            <SectionHead id="work-h" title="Work preferences" />
            <Surface className="p-5 sm:p-6">
              <WorkPreferenceList rows={workPreferences} />
            </Surface>
          </section>

          {academics ? <EducationSection {...rise(3)} academics={academics} headline={headline} /> : null}

          {experiences.length > 0 ? <ExperienceSection {...rise(3)} experiences={experiences} t={t} /> : null}

          {qualifications.length > 0 || (academics && academics.courses.length > 0) ? (
            <CertificatesSection {...rise(3)} qualifications={qualifications} courses={academics?.courses ?? []} t={t} />
          ) : null}

          {languages.length > 0 || activities.length > 0 ? <LanguagesActivities {...rise(3)} languages={languages} activities={activities} t={t} /> : null}
        </div>
      </div>
    </div>
  );
}
