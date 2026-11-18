import Link from "next/link";
import { Check, ChevronDown, ExternalLink, EyeOff, Laptop, Lock, MapPin } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { ScoreBar } from "@/components/app/score-bar";
import { buttonClass } from "@/components/ui/button";
import { RowAvatar, ScoreBadge, SkillChips } from "@/components/employer/candidate-row-parts";
import { MAX_SKILL_CHIPS, headlineOf } from "@/components/employer/candidate-view";
import { OpenToWorkToggle } from "@/components/intern/open-to-work-toggle";
import { linkedinHref, type OnboardingDraft } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { CardEmpty, ProfileCard } from "./card";
import {
  dateRange,
  degreeLine,
  documentRows,
  durationLabel,
  monthYear,
  scoreLine,
  splitExperience,
  statusLabel,
  uniqueCi,
  workModeLine,
} from "./profile-logic";
import type { ProfileStatus } from "./summary";

/** Where every edit goes: the one form that owns these fields. */
const FORM = "/intern/onboarding";

type Exp = OnboardingDraft["experiences"][number];

/* ── Visibility and the employer's row ───────────────────────────────── */

export function VisibilityCard({
  status,
  openToWork,
  initials,
  photoUrl,
  draft,
  score,
}: {
  status: ProfileStatus;
  openToWork: boolean;
  initials: string;
  photoUrl: string | null;
  draft: OnboardingDraft | null;
  score: number | null;
}) {
  const skills = draft?.skills.filter(Boolean) ?? [];
  const a = draft?.academics;
  const modes = workModeLine(draft?.locationTypes ?? []);
  const headline =
    draft && a
      ? headlineOf({
          academics: { degree: a.degree, specialization: a.branch },
          skills,
        })
      : "";
  return (
    <ProfileCard id="visibility" title="Visibility" hint={status.detail} firstContent>
      <OpenToWorkToggle initial={openToWork} />
      {draft ? (
        <div className="mt-5 border-t border-ink-100 pt-5">
          <h3 className="text-sm font-semibold text-ink-900">What employers see</h3>
          {/* The employer's own row, built from the employer's own parts, so this can never promise more than the real one shows. */}
          <div
            role="group"
            aria-label="Your row in an employer's search"
            className="mt-3 rounded-xl border border-ink-200 px-4 py-4 sm:px-5"
          >
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-3 sm:gap-x-5">
              <RowAvatar photoUrl={photoUrl} initials={initials} />
              <div className="min-w-0 self-center sm:self-start">
                <p className="text-[15px] font-semibold text-ink-900">{initials}</p>
                {headline ? (
                  <p className="mt-0.5 line-clamp-2 text-pretty text-base font-medium leading-snug text-ink-900 sm:text-lg">{headline}</p>
                ) : null}
                <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-ink-600">
                  <MapPin className="size-3.5 shrink-0 text-ink-500" aria-hidden />
                  {draft.city || "City not stated"}
                </p>
              </div>
              <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">
                <p className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-ink-700">
                  <ScoreBadge score={score ?? 0} scored={score !== null} />
                  {modes ? <span>{modes}</span> : null}
                  {draft.hasLaptop !== null ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Laptop className="size-4 shrink-0 text-ink-500" aria-hidden />
                      {draft.hasLaptop ? "Own laptop" : "Needs a laptop"}
                    </span>
                  ) : null}
                </p>
                <SkillChips className="mt-3" skills={skills} wanted={[]} />
              </div>
            </div>
          </div>
          <p className="mt-3 flex max-w-prose items-start gap-2 text-pretty text-sm text-ink-600">
            <EyeOff className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />
            Until a company hires you it sees your initials, photo, city, score and up to {MAX_SKILL_CHIPS} skills. Your name, contact
            details and LinkedIn stay hidden.
          </p>
        </div>
      ) : null}
    </ProfileCard>
  );
}

/* ── Score and the AI interview ──────────────────────────────────────── */

export function InterviewCard({
  ratings,
  aiLinks,
}: {
  ratings: [string, number][];
  aiLinks: { feedbackLink: string | null; recordingLink: string | null };
}) {
  if (ratings.length === 0 && !aiLinks.feedbackLink && !aiLinks.recordingLink) return null;
  return (
    <ProfileCard id="interview" title="AI interview" hint="How you scored on each part. Employers see the overall Findtern Score.">
      {ratings.length > 0 ? (
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {ratings.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4">
              <dt className="text-sm font-medium text-ink-800">{label}</dt>
              <dd className="nums text-2xl font-light leading-none tracking-[-0.04em] text-ink-900">
                {value.toFixed(1)}
                <span className="ml-0.5 text-xs font-normal tracking-normal text-ink-600">/10</span>
              </dd>
              <dd className="col-span-2 [&>div]:mt-2">
                <ScoreBar value={value} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {aiLinks.feedbackLink || aiLinks.recordingLink ? (
        <div className={cn("flex flex-wrap gap-2", ratings.length > 0 && "mt-5 border-t border-ink-100 pt-5")}>
          {aiLinks.feedbackLink ? (
            <a
              href={aiLinks.feedbackLink}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({
                variant: "outline",
                size: "sm",
                className: "touch:min-h-11",
              })}
            >
              Feedback report
              <span className="sr-only"> (opens in a new tab)</span>
              <ExternalLink className="size-4" aria-hidden />
            </a>
          ) : null}
          {aiLinks.recordingLink ? (
            <a
              href={aiLinks.recordingLink}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({
                variant: "outline",
                size: "sm",
                className: "touch:min-h-11",
              })}
            >
              Recording
              <span className="sr-only"> (opens in a new tab)</span>
              <ExternalLink className="size-4" aria-hidden />
            </a>
          ) : null}
        </div>
      ) : null}
    </ProfileCard>
  );
}

/* ── Where and how ───────────────────────────────────────────────────── */

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-text-subtle">{label}</dt>
      <dd className={cn("mt-1 text-sm [overflow-wrap:anywhere]", value ? "font-medium text-ink-900" : "text-ink-600")}>
        {value ?? "Not added yet"}
      </dd>
    </div>
  );
}

export function PreferencesCard({ draft }: { draft: OnboardingDraft }) {
  const modes = workModeLine(draft.locationTypes);
  const place = [draft.city, draft.state].filter(Boolean).join(", ");
  const cities = uniqueCi(draft.preferredLocations);
  return (
    <ProfileCard id="preferences" title="Work preferences" edit={{ href: FORM, label: "work preferences" }}>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <Fact label="Work mode" value={modes} />
        <Fact label="Preferred cities" value={cities.length > 0 ? cities.join(", ") : modes === "Remote" ? "Remote only" : null} />
        <Fact label="Lives in" value={place || null} />
        <Fact label="Laptop" value={draft.hasLaptop === null ? null : draft.hasLaptop ? "Has own laptop" : "Needs a laptop"} />
      </dl>
    </ProfileCard>
  );
}

/* ── Skills ──────────────────────────────────────────────────────────── */

export function SkillsCard({ skills }: { skills: string[] }) {
  const edit = skills.length > 0 ? { href: FORM, label: "skills" } : undefined;
  return (
    <ProfileCard
      id="skills"
      title="Skills"
      edit={edit}
      hint={skills.length > MAX_SKILL_CHIPS ? `Employers see your first ${MAX_SKILL_CHIPS} skills, shown in green.` : undefined}
    >
      {skills.length > 0 ? (
        <ul aria-label="Skills" className="flex flex-wrap gap-2">
          {skills.map((skill, i) => (
            <li
              key={skill}
              className={cn(
                "inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium ring-1 ring-inset",
                i < MAX_SKILL_CHIPS ? "bg-brand-50 text-brand-900 ring-brand-200" : "bg-white text-ink-700 ring-ink-300",
              )}
            >
              {skill}
            </li>
          ))}
        </ul>
      ) : (
        <CardEmpty
          title="No skills yet"
          body="Skills are what employers search for when they look for candidates. Add at least four."
          action={{ label: "Add skills", href: FORM }}
        />
      )}
    </ProfileCard>
  );
}

/* ── Education ───────────────────────────────────────────────────────── */

export function EducationCard({ draft }: { draft: OnboardingDraft }) {
  const a = draft.academics;
  const has = Boolean(a.institution || a.degree);
  const years = [a.startYear, a.yearOfGraduation].filter(Boolean).join(" – ");
  const score = scoreLine(a);
  const status = statusLabel(a.status);
  return (
    <ProfileCard id="education" title="Education" edit={has ? { href: FORM, label: "education" } : undefined}>
      {has ? (
        <div className="flex gap-4">
          <div className="min-w-0">
            <p className="text-base font-medium text-ink-900 [overflow-wrap:anywhere]">{a.institution || "College not stated"}</p>
            <p className="mt-0.5 text-sm text-ink-700 [overflow-wrap:anywhere]">{degreeLine(a) || "Degree not stated"}</p>
            {years ? <p className="nums mt-1 text-sm text-ink-600">{years}</p> : null}
            {score || status ? (
              <p className="mt-3 flex flex-wrap gap-1.5">
                {score ? <Pill tone="neutral">{score}</Pill> : null}
                {status ? <Pill tone={status === "Completed" ? "live" : "neutral"}>{status}</Pill> : null}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <CardEmpty
          title="No education added"
          body="Employers filter by degree, college and graduation year first."
          action={{ label: "Add education", href: FORM }}
        />
      )}
    </ProfileCard>
  );
}

/* ── Experience and projects ─────────────────────────────────────────── */

/** Entries shown before "Show all": a long history should not push everything else off the page. */
const SHOWN = 3;

function WorkItem({ exp }: { exp: Exp }) {
  const range = dateRange(exp.from, exp.to, exp.current);
  const span = durationLabel(exp.from, exp.to, exp.current);
  return (
    <li className="relative">
      <span
        aria-hidden
        className={cn(
          "absolute -left-[1.8125rem] top-[0.4375rem] size-2.5 rounded-full ring-4 ring-white",
          exp.current ? "bg-brand-600" : "bg-ink-300",
        )}
      />
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <p className="text-base font-medium text-ink-900 [overflow-wrap:anywhere]">{exp.role || exp.company}</p>
        {exp.type ? <Pill tone="neutral">{exp.type}</Pill> : null}
      </div>
      {exp.role && exp.company ? <p className="mt-0.5 text-sm text-ink-700 [overflow-wrap:anywhere]">{exp.company}</p> : null}
      {range ? (
        <p className="nums mt-1 text-sm text-ink-600">
          {range}
          {span ? <span> ({span})</span> : null}
        </p>
      ) : null}
      {exp.description ? (
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-700 [overflow-wrap:anywhere]">
          {exp.description}
        </p>
      ) : null}
    </li>
  );
}

const RAIL = "relative ml-1.5 space-y-6 border-l border-ink-200 pl-6";

function More({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <details className="group mt-4">
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-brand-700 hover:underline underline-offset-4 touch:min-h-11 [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Show all {count}</span>
        <span className="hidden group-open:inline">Show fewer</span>
        <ChevronDown
          className="size-4 transition-transform duration-150 ease-out group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

export function ExperienceCard({ draft }: { draft: OnboardingDraft }) {
  const { work } = splitExperience(draft.experiences);
  return (
    <ProfileCard
      id="experience"
      title={work.length ? `Experience (${work.length})` : "Experience"}
      edit={work.length > 0 ? { href: FORM, label: "experience" } : undefined}
    >
      {work.length > 0 ? (
        <>
          <ol className={RAIL}>
            {work.slice(0, SHOWN).map((e) => (
              <WorkItem key={e.id} exp={e} />
            ))}
          </ol>
          {work.length > SHOWN ? (
            <More count={work.length}>
              <ol className={RAIL}>
                {work.slice(SHOWN).map((e) => (
                  <WorkItem key={e.id} exp={e} />
                ))}
              </ol>
            </More>
          ) : null}
        </>
      ) : (
        <CardEmpty
          title="No experience yet"
          body="Internships, jobs and freelance work go here. Starting out? Projects count too, and have their own section."
          action={{ label: "Add experience", href: FORM }}
        />
      )}
    </ProfileCard>
  );
}

function ProjectItem({ exp }: { exp: Exp }) {
  const range = dateRange(exp.from, exp.to, exp.current);
  return (
    <li className="min-w-0">
      <p className="text-base font-medium text-ink-900 [overflow-wrap:anywhere]">{exp.role || exp.company}</p>
      {exp.role && exp.company ? <p className="mt-0.5 text-sm text-ink-700 [overflow-wrap:anywhere]">{exp.company}</p> : null}
      {range ? <p className="nums mt-1 text-sm text-ink-600">{range}</p> : null}
      {exp.description ? (
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-700 [overflow-wrap:anywhere]">
          {exp.description}
        </p>
      ) : null}
    </li>
  );
}

const PROJECT_GRID = "grid gap-x-8 gap-y-6 md:grid-cols-2";

export function ProjectsCard({ draft }: { draft: OnboardingDraft }) {
  const { projects } = splitExperience(draft.experiences);
  return (
    <ProfileCard
      id="projects"
      title={projects.length ? `Projects (${projects.length})` : "Projects"}
      edit={projects.length > 0 ? { href: FORM, label: "projects" } : undefined}
    >
      {projects.length > 0 ? (
        <>
          <ul className={PROJECT_GRID}>
            {projects.slice(0, 4).map((e) => (
              <ProjectItem key={e.id} exp={e} />
            ))}
          </ul>
          {projects.length > 4 ? (
            <More count={projects.length}>
              <ul className={PROJECT_GRID}>
                {projects.slice(4).map((e) => (
                  <ProjectItem key={e.id} exp={e} />
                ))}
              </ul>
            </More>
          ) : null}
        </>
      ) : (
        <CardEmpty
          title="No projects yet"
          body="A project you built, even a college one, shows an employer how you work."
          action={{ label: "Add a project", href: FORM }}
        />
      )}
    </ProfileCard>
  );
}

/* ── Courses and certifications ──────────────────────────────────────── */

export function CertificationsCard({ draft }: { draft: OnboardingDraft }) {
  const a = draft.academics;
  const list = [...a.professional, ...a.certifications].filter((q) => q.name);
  if (list.length === 0) return null;
  return (
    <ProfileCard id="certifications" title="Courses and certifications" edit={{ href: FORM, label: "courses and certifications" }}>
      <ul className="divide-y divide-ink-100">
        {list.map((q) => (
          <li key={q.id} className="py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-base font-medium text-ink-900 [overflow-wrap:anywhere]">{q.name}</p>
              <p className="nums mt-0.5 text-sm text-ink-600 [overflow-wrap:anywhere]">
                {[q.issuer, q.completionDate && monthYear(q.completionDate)].filter(Boolean).join(", ") || "No further detail"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </ProfileCard>
  );
}

/* ── Languages and activities ────────────────────────────────────────── */

export function LanguagesCard({ draft }: { draft: OnboardingDraft }) {
  const languages = draft.languages.filter((l) => l.language);
  const activities = draft.extracurriculars.filter((x) => x.activity);
  const both = languages.length > 0 && activities.length > 0;
  return (
    <ProfileCard
      id="languages"
      title={activities.length > 0 ? "Languages and activities" : "Languages"}
      edit={languages.length > 0 || activities.length > 0 ? { href: FORM, label: "languages and activities" } : undefined}
    >
      {languages.length === 0 && activities.length === 0 ? (
        <CardEmpty
          title="No languages added"
          body="Shows which languages you can work in with a team or client."
          action={{ label: "Add languages", href: FORM }}
        />
      ) : (
        <div className={cn("grid gap-x-10 gap-y-6", both && "md:grid-cols-2")}>
          {languages.length > 0 ? (
            <div className="min-w-0">
              {both ? <h3 className="text-sm font-semibold text-ink-900">Languages</h3> : null}
              <ul className={cn("space-y-3", both && "mt-3")}>
                {languages.map((l) => (
                  <li key={l.id} className="text-sm [overflow-wrap:anywhere]">
                    <span className="font-medium capitalize text-ink-900">{l.language}</span>
                    {l.level ? <span className="ml-2 text-ink-600">{l.level}</span> : null}
                    {l.read || l.write || l.speak ? (
                      <span className="block text-ink-600">
                        {[l.read && "Read", l.write && "Write", l.speak && "Speak"]
                          .filter(Boolean)
                          .join(", ")
                          .toLowerCase()
                          .replace(/^./, (c) => c.toUpperCase())}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {activities.length > 0 ? (
            <div className="min-w-0">
              {both ? <h3 className="text-sm font-semibold text-ink-900">Activities</h3> : null}
              <ul className={cn("space-y-3", both && "mt-3")}>
                {activities.map((x) => (
                  <li key={x.id} className="text-sm [overflow-wrap:anywhere]">
                    <span className="font-medium text-ink-900">{x.activity}</span>
                    {x.level || x.category ? (
                      <span className="block text-ink-600">
                        {[x.category, x.level]
                          .filter(Boolean)
                          .join(", ")
                          .toLowerCase()
                          .replace(/^./, (c) => c.toUpperCase())}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </ProfileCard>
  );
}

/* ── Private: contact, links, documents ──────────────────────────────── */

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-sm text-text-subtle">{label}</dt>
      <dd className={cn("min-w-0 text-sm font-medium text-ink-900 [overflow-wrap:anywhere] sm:text-right", mono && "nums")}>{children}</dd>
    </div>
  );
}

const MUTED = <span className="font-normal text-ink-600">Not added</span>;

export function ContactCard({
  contact,
  linkedin,
}: {
  contact: { email: string; phone: string | null; emergency: string | null };
  linkedin: string;
}) {
  const href = linkedinHref(linkedin);
  return (
    <ProfileCard
      id="contact"
      title="Contact and links"
      icon={<Lock className="size-4 text-ink-500" aria-hidden />}
      hint="Only you and Findtern see these. A company gets them once it hires you."
      edit={{ href: FORM, label: "emergency contact and LinkedIn" }}
    >
      <dl className="divide-y divide-ink-100">
        <Row label="Email">{contact.email || MUTED}</Row>
        <Row label="Phone" mono>
          {contact.phone ?? MUTED}
        </Row>
        <Row label="Emergency contact">{contact.emergency ?? MUTED}</Row>
        <Row label="LinkedIn">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-brand-700 underline-offset-4 hover:underline touch:min-h-11"
            >
              {linkedin.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}
              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            MUTED
          )}
        </Row>
      </dl>
      <Link
        href="/intern/settings#details"
        className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline touch:min-h-11"
      >
        Change name or phone in Settings
      </Link>
    </ProfileCard>
  );
}

export function DocumentsCard({
  draft,
  files,
}: {
  draft: OnboardingDraft | null;
  files: { photo: boolean; panImage: boolean; aadhaarImage: boolean };
}) {
  const rows = documentRows({
    photo: files.photo,
    panNumber: draft?.panNumber,
    panImage: files.panImage,
    aadhaarNumber: draft?.aadhaarNumber,
    aadhaarImage: files.aadhaarImage,
  });
  return (
    <ProfileCard
      id="documents"
      title="Documents"
      icon={<Lock className="size-4 text-ink-500" aria-hidden />}
      hint="Identity numbers show the last four characters only, and are never shown to employers before a hire."
      edit={{ href: FORM, label: "documents" }}
    >
      <ul className="divide-y divide-ink-100">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-900">{r.label}</p>
              <p className="nums mt-0.5 text-sm text-ink-600 [overflow-wrap:anywhere]">{r.detail}</p>
            </div>
            <Pill
              tone={r.state === "ok" ? "live" : "waiting"}
              icon={r.state === "ok" ? <Check aria-hidden /> : undefined}
              className="shrink-0"
            >
              {r.stateLabel}
            </Pill>
          </li>
        ))}
      </ul>
      {files.photo || files.panImage || files.aadhaarImage ? (
        <Link
          href="/intern/documents"
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline touch:min-h-11"
        >
          View uploaded files
        </Link>
      ) : null}
    </ProfileCard>
  );
}
