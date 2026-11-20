import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText, Link2, MapPin, Send, Video } from "lucide-react";

import { proposalPill } from "@/components/employer/proposal-state";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { formatDate, formatMoney, formatRate } from "@/lib/format";
import type { CandidateProfile } from "@/lib/employer-candidates";
import type { CandidateRelation } from "@/lib/employer-visibility";
import type { resolvePricing } from "@/lib/employer-pricing";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { SkillChips } from "@/components/employer/candidate-row-parts";
import { CompareToggle } from "@/components/employer/compare-toggle";
import { FullTimeOfferButton } from "@/components/employer/full-time-offer-button";
import type { aiInterviewLinks } from "@/lib/ai-interview-links";
import type { bandFor } from "@/lib/score";
import { dateLabel, type OnboardingDraft, type QualificationEntry } from "@/lib/onboarding";
import { Pill } from "@/components/app/primitives";
import { ScoreBar } from "@/components/app/score-bar";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { profileText } from "@/components/employer/profile-text";
import { PresenceDot } from "@/components/app/presence-dot";
import type { workPreferenceRows } from "@/lib/work-preferences";
import { WorkPreferenceList } from "@/components/employer/work-preferences";
import type { PresenceLabel } from "@/lib/presence";
import { PRESENCE_ONLINE } from "@/lib/presence-logic";
import type { candidateStatusPill } from "@/components/employer/candidate-status";

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
  const skills = profile.skills;
  const academics = profile.academics;
  /** Free text with contact details hidden until hire. */
  const t = (value: string | null | undefined) => (value ? profileText(value, nameUnlocked) : "");
  const SECTION = "rounded-2xl border border-ink-200 bg-white p-5 shadow-xs sm:p-6";
  const H2 = "text-lg font-semibold tracking-[-0.01em] text-ink-900";

  return (
    <div className="pb-12">
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

      {/* Left: who they are, then the evidence. Right (lg): the sticky hire box. A phone reads header, hire box, evidence. */}
      <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <header className="min-w-0 pb-8 lg:col-start-1">
          <div className="flex min-w-0 items-start gap-4 sm:gap-6">
            <span className="relative shrink-0">
              <CandidateAvatar
                photoUrl={profile.photoUrl}
                initials={profile.initials}
                seed={profile.id}
                className="size-18 rounded-full text-xl ring-1 ring-inset ring-black/5 sm:size-24 sm:text-2xl"
              />
              {presence ? (
                <span
                  aria-hidden
                  className={`absolute bottom-0.5 right-0.5 size-4 rounded-full ring-[3px] ring-white sm:bottom-1 sm:right-1 ${presence === PRESENCE_ONLINE ? "bg-success" : "bg-ink-300"}`}
                />
              ) : null}
            </span>
            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="break-words text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink-900 sm:text-3xl">
                  {displayName}
                  {nameUnlocked ? null : <span className="sr-only">. Names and contact details unlock once your hire is paid.</span>}
                </h1>
                {status && statusProjectName ? (
                  <Pill tone={status.tone} className="max-w-full">
                    <span className="truncate">{statusProjectName}: {status.label}</span>
                  </Pill>
                ) : null}
              </div>
              {headline ? <p className="mt-1 break-words text-lg leading-snug text-ink-800 sm:text-xl">{headline}</p> : null}
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 shrink-0 text-ink-500" aria-hidden />
                  {profile.location || "Location not stated"}
                </span>
                {presence ? <PresenceDot label={presence} withText /> : null}
                {linkedin ? (
                  <a
                    href={linkedin}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-11 items-center gap-1.5 font-medium text-brand-700 underline-offset-4 hover:underline"
                  >
                    <Link2 className="size-4" aria-hidden />
                    LinkedIn
                  </a>
                ) : null}
              </p>
            </div>
          </div>

          {/* The stats line, as on the candidate list: score and band, rate, how they work. */}
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-xs">
              <dt className="text-sm text-ink-600">Findtern Score</dt>
              <dd className="nums mt-0.5 text-4xl font-semibold leading-none tracking-[-0.02em] text-ink-900">
                {profile.scored ? (
                  <>
                    {profile.score.toFixed(1)}
                    <span className="ml-0.5 text-base font-medium tracking-normal text-text-subtle">/10</span>
                  </>
                ) : (
                  <span className="text-base font-medium text-ink-700">Not scored yet</span>
                )}
              </dd>
            </div>
            <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-xs">
              <dt className="text-sm text-ink-600">Works</dt>
              <dd className="mt-1.5 text-base font-medium text-ink-900">{profile.workModes.join(" / ") || "Not stated"}</dd>
            </div>
            <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-xs">
              <dt className="text-sm text-ink-600">Laptop</dt>
              <dd className="mt-1.5 text-base font-medium text-ink-900">
                {profile.hasLaptop === null ? "Not stated" : profile.hasLaptop ? "Own" : "Needs one"}
              </dd>
            </div>
          </dl>
          {profile.scored ? (
            // The band's own published meaning (lib/score BANDS), not a made-up label.
            <p className="mt-3 text-sm text-ink-600">
              <span className="mr-2 inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-sm font-medium text-brand-800 ring-1 ring-inset ring-brand-200/70">
                {plan}
              </span>
              Score {band.max >= 10 ? `${band.min}+` : `${band.min}–${band.max}`}. {band.blurb}
            </p>
          ) : null}
        </header>

        <aside aria-label="Hire" className="min-w-0 pb-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pb-0">
          <div className="space-y-5 rounded-apple-xl border border-ink-200/80 bg-white p-5 lg:sticky lg:top-20">
            <div>
              <p className="nums text-3xl font-semibold leading-none text-ink-900">{formatRate(pricing.hourlyRateMinor, currency)}</p>
              <p className="mt-2 text-sm text-ink-600">What you pay, set by the {profile.scored ? `${plan} ` : ""}band</p>
              {pricing.perHireMinor > 0 ? (
                <p className="nums mt-0.5 text-sm text-ink-600">
                  plus <span className="font-medium text-ink-900">{formatMoney(pricing.perHireMinor, currency)}</span> one-time hiring charge
                </p>
              ) : (
                <p className="nums mt-0.5 text-sm text-ink-600">
                  plus <s className="text-text-subtle">{formatMoney(pricing.perHireListMinor, currency)}</s>{" "}
                  <span className="font-semibold text-success">(FREE)</span> one-time hiring charge
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 [&_button]:w-full [&_button]:justify-center">
              {action.kind === "send" ? (
                <ButtonLink href={sendHref} variant="primary" block className="min-h-11">
                  <Send className="size-4" aria-hidden />
                  Send proposal
                </ButtonLink>
              ) : action.kind === "view" ? (
                <ButtonLink href={`/employer/proposal/${encodeURIComponent(action.proposalId)}`} variant="primary" block className="min-h-11">
                  View sent proposal
                </ButtonLink>
              ) : relation?.hired ? null : (
                <p className="rounded-apple-sm bg-ink-100 px-4 py-2.5 text-sm text-ink-700">{action.reason}</p>
              )}
              {relation?.hired && relation.proposal ? (
                <ButtonLink href={`/employer/proposal/${encodeURIComponent(relation.proposal.id)}`} variant="primary" block className="min-h-11">
                  View placement
                </ButtonLink>
              ) : null}
              {relation?.fullTimeFrom ? (
                <FullTimeOfferButton
                  employerId={employerId}
                  proposalId={relation.fullTimeFrom}
                  candidate={displayName}
                  fteStatus={employerFte}
                  timezone={employerZone}
                />
              ) : null}
              {shortlist && action.kind === "send" ? (
                <ShortlistToggle internId={profile.id} projectId={shortlist.projectId} shortlisted={shortlist.on} />
              ) : null}
              {/* EMB-12: hires and full-time offers are not compared (legacy). */}
              {compareBlocked ? null : <CompareToggle employerId={employerId} internId={profile.id} projectId={shortlist?.projectId ?? null} picked={comparePicks} />}
            </div>

            {appliedProjects.length > 0 ? (
              <div className="border-t border-ink-100 pt-4">
                <h2 className="text-sm font-semibold text-ink-900">Your proposals to them</h2>
                <ul className="mt-2 space-y-2">
                  {appliedProjects.slice(0, PROPOSALS_SHOWN).map((entry) => {
                    const pill = proposalPill(entry.status, entry.fullTime);
                    return (
                      <li key={entry.id} className="flex min-w-0 items-start justify-between gap-3 text-sm">
                        <span className="min-w-0 break-words text-ink-800">{entry.projectName ?? "Project no longer listed"}</span>
                        <Pill tone={pill.tone} className="shrink-0">
                          {pill.label}
                        </Pill>
                      </li>
                    );
                  })}
                </ul>
                {appliedProjects.length > PROPOSALS_SHOWN ? (
                  <Link href="/employer/proposals" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900">
                    See all {appliedProjects.length} in Proposals
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0 space-y-4 lg:col-start-1">
          {skills.length > 0 ? (
            <section aria-labelledby="skills-h" className={SECTION}>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="skills-h" className={H2}>
                  Skills
                </h2>
                {wanted && wanted.skills.length > 0 ? (
                  <p className="text-sm text-ink-600">
                    <span className="nums">{matchCount}</span> of {wanted.skills.length} match {wanted.project}
                  </p>
                ) : null}
              </div>
              {/* The same chips as the candidate list: project matches first and ticked, at most seven, then +N. */}
              <SkillChips skills={skills} wanted={wanted?.skills ?? []} />
            </section>
          ) : null}

          <section aria-labelledby="work-h" className={SECTION}>
            <h2 id="work-h" className={`${H2} mb-4`}>
              Work preferences
            </h2>
            <WorkPreferenceList rows={workPreferences} />
          </section>

          <section id="ai-report" aria-labelledby="ai-h" className={`${SECTION} scroll-mt-24`}>
            <h2 id="ai-h" className={H2}>
              AI interview
            </h2>
            {/* The bars are the evidence; the sentence only names the spread. All parts tied: the bars say it. */}
            {rated.length === 0 ? (
              <p className="mt-1 text-sm text-ink-600">No AI interview score yet. The breakdown appears once the interview is reviewed.</p>
            ) : rated.length > 1 && rated[0].value !== rated[rated.length - 1].value ? (
              <p className="mt-1 text-sm text-ink-600">
                Strongest in {rated[0].label} (<span className="nums">{rated[0].value.toFixed(1)}</span>), lowest in {rated[rated.length - 1].label} (
                <span className="nums">{rated[rated.length - 1].value.toFixed(1)}</span>).
              </p>
            ) : null}
            <dl className="mt-4 max-w-2xl divide-y divide-ink-100">
              {axes.map(({ label, value }) => (
                <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-4 py-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <dt className="text-sm text-ink-700">{label}</dt>
                  {value !== null ? (
                    <dd className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-4 sm:grid-cols-[minmax(0,1fr)_3.5rem]">
                      <div className="[&>div]:mt-0">
                        <ScoreBar value={value} />
                      </div>
                      <span className="nums text-right text-sm">
                        <span className="font-semibold text-ink-900">{value.toFixed(1)}</span>
                        <span className="text-text-subtle">/10</span>
                      </span>
                    </dd>
                  ) : (
                    <dd className="text-sm text-text-subtle">Not rated yet</dd>
                  )}
                </div>
              ))}
            </dl>
            {rated.length > 0 && (aiLinks.feedbackLink || (nameUnlocked && aiLinks.recordingLink)) ? (
              <div className="-ml-3 mt-3 flex flex-wrap items-center gap-1 print:hidden">
                {aiLinks.feedbackLink ? (
                  <a href={aiLinks.feedbackLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
                    <FileText className="size-4" aria-hidden />
                    Feedback report
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
                {/* Recording only after hire; the written report before (legacy). */}
                {nameUnlocked && aiLinks.recordingLink ? (
                  <a href={aiLinks.recordingLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
                    <Video className="size-4" aria-hidden />
                    Recording
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
              </div>
            ) : null}
          </section>

          {academics ? (
            <section aria-labelledby="edu-h" className={SECTION}>
              <h2 id="edu-h" className={`${H2} mb-4`}>
                Education
              </h2>
              <p className="break-words text-base font-medium text-ink-900">{academics.institution || "Institution not stated"}</p>
              <p className="mt-0.5 break-words text-sm text-ink-700">
                {[headline, academics.level ? humanise(academics.level) : ""].filter(Boolean).join(" · ") || "Degree not stated"}
              </p>
              <p className="nums mt-0.5 text-sm text-ink-600">
                {[
                  [academics.startYear, academics.endYear].filter(Boolean).join(" – "),
                  academics.score ? `${academics.score}${academics.scoreType ? ` ${academics.scoreType.toUpperCase()}` : ""}` : "",
                  academics.status ? humanise(academics.status) : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </section>
          ) : null}

          {experiences.length > 0 ? (
            <section aria-labelledby="exp-h" className={SECTION}>
              <h2 id="exp-h" className={`${H2} mb-2`}>
                Experience and projects
              </h2>
              <ul className="divide-y divide-ink-100">
                {experiences.map((exp) => (
                  <li key={exp.id} className="py-4">
                    <p className="break-words text-base font-medium text-ink-900">{[t(exp.role), t(exp.company)].filter(Boolean).join(" · ")}</p>
                    {exp.type || exp.from || exp.to || exp.current ? (
                      <p className="nums mt-0.5 text-sm text-ink-600">
                        {[exp.type, [dateLabel(exp.from), exp.current ? "Present" : dateLabel(exp.to)].filter(Boolean).join(" – ")]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {exp.description ? <p className="mt-2 max-w-prose whitespace-pre-line break-words text-sm leading-relaxed text-ink-700">{t(exp.description)}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {qualifications.length > 0 || (academics && academics.courses.length > 0) ? (
            <section aria-labelledby="cert-h" className={SECTION}>
              <h2 id="cert-h" className={`${H2} mb-2`}>
                Certificates and courses
              </h2>
              <ul className="divide-y divide-ink-100">
                {qualifications.map((q) => (
                  <li key={q.id} className="py-3">
                    <p className="break-words text-base font-medium text-ink-900">{t(q.name)}</p>
                    <p className="nums mt-0.5 text-sm text-ink-600">
                      {[t(q.issuer), q.completionDate && formatDate(q.completionDate)].filter(Boolean).join(" · ") || "No further detail recorded"}
                    </p>
                  </li>
                ))}
                {(academics?.courses ?? []).map((course, i) => (
                  <li key={`${course.name}-${i}`} className="py-3">
                    <p className="break-words text-base font-medium text-ink-900">{t(course.name)}</p>
                    <p className="nums mt-0.5 text-sm text-ink-600">
                      {[t(course.institution), course.level, course.completed, course.score].filter(Boolean).join(" · ") || "No further detail recorded"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {languages.length > 0 || activities.length > 0 ? (
            <section aria-label="Languages and activities" className={`${SECTION} grid gap-8 sm:grid-cols-2`}>
              {languages.length > 0 ? (
                <div className="min-w-0">
                  <h2 className={`${H2} mb-3`}>Languages</h2>
                  <ul className="space-y-3">
                    {languages.map((l) => (
                      <li key={l.id} className="text-sm">
                        <span className="font-medium text-ink-900">{l.language}</span>
                        <span className="block text-ink-600">
                          {[l.level, l.read && "Read", l.write && "Write", l.speak && "Speak"].filter(Boolean).join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {activities.length > 0 ? (
                <div className="min-w-0">
                  <h2 className={`${H2} mb-3`}>Activities</h2>
                  <ul className="space-y-3">
                    {activities.map((a) => (
                      <li key={a.id} className="text-sm">
                        <span className="font-medium text-ink-900">{t(a.activity)}</span>
                        <span className="block text-ink-600">{[a.category, a.level].filter(Boolean).join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** "Your proposals to them" shows the latest few; the rest live on the Proposals page. */
const PROPOSALS_SHOWN = 3;
function humanise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/[_-]+/g, " ");
}
