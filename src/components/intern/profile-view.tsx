import { ChevronDown, ExternalLink, EyeOff, Laptop, MapPin } from "lucide-react";

import { DetailRow, EmptyScene, Pill, type Tone } from "@/components/app/primitives";
import { ScoreBar } from "@/components/app/score-bar";
import { buttonClass } from "@/components/ui/button";
import { RowAvatar, ScoreBadge, SkillChips } from "@/components/employer/candidate-row-parts";
import { MAX_SKILL_CHIPS, headlineOf } from "@/components/employer/candidate-view";
import { dateLabel, type OnboardingDraft } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/**
 * The candidate's profile, laid out the way an employer reads it (INT-13).
 *
 * The focal point is the employer's own search row, drawn with the employer's
 * components (photo, initials, score, at most seven skills), so the preview can
 * never promise something the real row does not show. The sections below
 * follow in the order an employer scans them, on thin rules rather than boxes.
 * No bio anywhere (owner rule).
 */

export type ProfileStatus = { tone: Tone; label: string; detail: string };

/** Work modes are stored as the implied set (onsite ⇒ hybrid + remote); say it the same way. */
function workModeLine(modes: string[]): string | null {
  const set = new Set(modes.map((m) => m.toLowerCase()));
  if (set.has("onsite")) return "On-site, and open to hybrid or remote";
  if (set.has("hybrid")) return "Hybrid, and open to remote";
  if (set.has("remote")) return "Remote";
  return null;
}

/** A flat section: a thin rule above, no box (the employer candidate list's language). */
function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-ink-200/70 py-6", className)}>
      <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Entries shown before "Show all": a long history should not push everything else off the page. */
const EXPERIENCE_SHOWN = 3;

export function ProfileView({
  initials,
  photoUrl,
  status,
  score,
  ratings,
  draft,
  aiLinks,
}: {
  /** Initials exactly as employers get them (`initialsOf` in lib/employer-candidates). */
  initials: string;
  photoUrl: string | null;
  status: ProfileStatus;
  score: number | null;
  ratings: [label: string, value: number][];
  draft: OnboardingDraft | null;
  aiLinks: { feedbackLink: string | null; recordingLink: string | null };
}) {
  if (!draft) {
    return (
      <EmptyScene
        art
        title="Your profile is empty"
        body="Employers search the profile you fill in: your skills, studies, experience and where you can work."
        next={{ label: "Start your profile", href: "/intern/onboarding" }}
      />
    );
  }

  const place = [draft.city, draft.state].filter(Boolean).join(", ");
  const skills = draft.skills.filter(Boolean);
  const a = draft.academics;
  const experiences = draft.experiences.filter((e) => e.company || e.role);
  const qualifications = [...a.professional, ...a.certifications].filter((q) => q.name);
  const languages = draft.languages.filter((l) => l.language);
  const activities = draft.extracurriculars.filter((x) => x.activity);
  const modes = workModeLine(draft.locationTypes);
  // The same headline rule the employer row uses: degree and field, else the top two skills.
  const headline = headlineOf({ academics: { degree: a.degree, specialization: a.branch }, skills });

  return (
    <div>
      {/* ── The employer's row, built from this profile ─────────── */}
      <section data-first-content aria-labelledby="preview-head" className="pb-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="preview-head" className="text-base font-semibold tracking-[-0.01em] text-ink-900">
            What employers see
          </h2>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
        <p className="mt-1 max-w-prose text-pretty text-sm text-ink-600">{status.detail}</p>

        <div role="group" aria-label="Your row in an employer's search" className="mt-4 rounded-apple-xl border border-ink-200/80 bg-white px-4 sm:px-6">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-3 py-5 sm:gap-x-5">
            <RowAvatar photoUrl={photoUrl} initials={initials} />
            <div className="min-w-0 self-center sm:self-start">
              <p className="text-[15px] font-semibold text-ink-900">{initials}</p>
              {headline ? <p className="mt-0.5 line-clamp-2 text-pretty text-base font-medium leading-snug text-ink-900 sm:text-lg">{headline}</p> : null}
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
          Until a company hires you it sees your initials, photo, city, score and up to {MAX_SKILL_CHIPS} skills. Your name, contact details and LinkedIn stay hidden.
        </p>
      </section>

      {/* ── Score and the AI interview ──────────────────────────── */}
      {ratings.length > 0 || aiLinks.feedbackLink || aiLinks.recordingLink ? (
        <Section title="AI interview">
          {ratings.length > 0 ? (
            <dl>
              {ratings.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-x-4 py-2 sm:grid-cols-[8rem_minmax(0,1fr)_3.5rem]">
                  <dt className="text-sm text-ink-700">{label}</dt>
                  <dd className="[&>div]:mt-0">
                    <ScoreBar value={value} />
                  </dd>
                  <dd className="nums text-right text-sm font-semibold text-ink-900">
                    {value.toFixed(1)}
                    <span className="font-normal text-ink-600">/10</span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {aiLinks.feedbackLink || aiLinks.recordingLink ? (
            <div className={cn("flex flex-wrap gap-2", ratings.length > 0 && "mt-4")}>
              {aiLinks.feedbackLink ? (
                <a href={aiLinks.feedbackLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm", className: "touch:min-h-11" })}>
                  Feedback report
                  <span className="sr-only"> (opens in a new tab)</span>
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              ) : null}
              {aiLinks.recordingLink ? (
                <a href={aiLinks.recordingLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm", className: "touch:min-h-11" })}>
                  Recording
                  <span className="sr-only"> (opens in a new tab)</span>
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* ── Where and how ───────────────────────────────────────── */}
      <Section title="Work preferences">
        <dl className="divide-y divide-ink-100">
          <DetailRow label="Work mode" value={modes ?? "Not chosen yet"} />
          <DetailRow
            label="Preferred cities"
            value={draft.preferredLocations.length > 0 ? uniqueCi(draft.preferredLocations).join(", ") : modes === "Remote" ? "Remote only" : "None added"}
          />
          <DetailRow label="Lives in" value={place || "Not added yet"} />
        </dl>
      </Section>

      {/* ── Academics ───────────────────────────────────────────── */}
      {a.institution || a.degree ? (
        <Section title="Academics">
          <p className="text-base font-medium text-ink-900 [overflow-wrap:anywhere]">{[a.degree, a.branch].filter(Boolean).join(", ") || "Degree not stated"}</p>
          <p className="nums mt-1 text-sm text-ink-600 [overflow-wrap:anywhere]">
            {[
              a.institution,
              [a.startYear, a.yearOfGraduation].filter(Boolean).join(" – "),
              a.cgpa ? (a.scoreType === "percentage" ? `${a.cgpa}%` : `CGPA ${a.cgpa} / 10`) : "",
              a.status ? a.status.charAt(0).toUpperCase() + a.status.slice(1) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </Section>
      ) : null}

      {/* ── Experience ──────────────────────────────────────────── */}
      {experiences.length > 0 ? (
        <Section title={`Experience and projects (${experiences.length})`}>
          <ul className="divide-y divide-ink-100">{experiences.slice(0, EXPERIENCE_SHOWN).map(experienceItem)}</ul>
          {experiences.length > EXPERIENCE_SHOWN ? (
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show all {experiences.length}</span>
                <span className="hidden group-open:inline">Show fewer</span>
                <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
              </summary>
              <ul className="divide-y divide-ink-100 border-t border-ink-100">{experiences.slice(EXPERIENCE_SHOWN).map(experienceItem)}</ul>
            </details>
          ) : null}
        </Section>
      ) : null}

      {/* ── Courses and certifications ──────────────────────────── */}
      {qualifications.length > 0 ? (
        <Section title="Courses and certifications">
          <ul className="divide-y divide-ink-100">
            {qualifications.map((q) => (
              <li key={q.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-base font-medium text-ink-900 [overflow-wrap:anywhere]">{q.name}</p>
                <p className="nums mt-1 text-sm text-ink-600 [overflow-wrap:anywhere]">
                  {[q.issuer, q.completionDate && dateLabel(q.completionDate)].filter(Boolean).join(" · ") || "No further detail"}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* ── Languages and activities ────────────────────────────── */}
      {languages.length > 0 || activities.length > 0 ? (
        <div className={cn("grid border-t border-ink-200/70 sm:gap-x-10", languages.length > 0 && activities.length > 0 && "sm:grid-cols-2")}>
          {languages.length > 0 ? (
            <Section title="Languages" className="border-t-0">
              <ul className="space-y-2">
                {languages.map((l) => (
                  <li key={l.id} className="text-sm [overflow-wrap:anywhere]">
                    <span className="font-medium capitalize text-ink-900">{l.language}</span>
                    {l.level || l.read || l.write || l.speak ? (
                      <span className="text-ink-600">
                        {" "}
                        · {[l.level, l.read && "read", l.write && "write", l.speak && "speak"].filter(Boolean).join(", ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {activities.length > 0 ? (
            <Section title="Extracurriculars" className="border-t-0 max-sm:border-t">
              <ul className="space-y-2">
                {activities.map((x) => (
                  <li key={x.id} className="text-sm [overflow-wrap:anywhere]">
                    <span className="font-medium text-ink-900">{x.activity}</span>
                    {x.level || x.category ? <span className="text-ink-600"> · {[x.category, x.level].filter(Boolean).join(", ")}</span> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function experienceItem(exp: OnboardingDraft["experiences"][number]) {
  return (
    <li key={exp.id} className="py-3 first:pt-0 last:pb-0">
      <p className="text-base font-medium text-ink-900 [overflow-wrap:anywhere]">{[exp.role, exp.company].filter(Boolean).join(" · ")}</p>
      <p className="nums mt-1 text-sm text-ink-600 [overflow-wrap:anywhere]">
        {[exp.type, [dateLabel(exp.from), exp.current ? "Present" : dateLabel(exp.to)].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}
      </p>
      {exp.description ? (
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-700 [overflow-wrap:anywhere]">{exp.description}</p>
      ) : null}
    </li>
  );
}

/** Case-insensitive de-duplication, first spelling wins ("Bengaluru, bengaluru" → "Bengaluru"). */
function uniqueCi(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((v) => {
    const k = v.trim().toLowerCase();
    return k && !seen.has(k) && (seen.add(k), true);
  });
}
