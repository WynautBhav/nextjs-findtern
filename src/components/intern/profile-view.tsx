import { ExternalLink, MapPin } from "lucide-react";

import { DetailRow, EmptyScene, Pill, Surface, type Tone } from "@/components/app/primitives";
import { ScoreDial } from "@/components/app/score-dial";
import { bandRateLine } from "@/components/intern/home/band-rate";
import { EmployerCard } from "@/components/intern/kit/employer-card";
import { buttonClass } from "@/components/ui/button";
import { InternAvatar } from "@/components/intern/avatar";
import { dateLabel, type OnboardingDraft } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/**
 * The candidate's profile, laid out the way an employer reads it (INT-13).
 *
 * Legacy "My profile" showed everything an employer could open: photo,
 * open-to-work, laptop, location, skills with levels, preferences,
 * experience, score and ratings, academics, courses, certifications,
 * languages, extracurriculars and the AI interview links. This is that page,
 * on the system: one identity block as the focal point, then the sections in
 * the order an employer scans them.
 */

const AXIS_LEGEND = [
  ["Communication", "communication"],
  ["Coding", "coding"],
  ["Aptitude", "aptitude"],
  ["Interview", "interview"],
] as const;

export type ProfileStatus = { tone: Tone; label: string; detail: string };

/** Work modes are stored as the implied set (onsite ⇒ hybrid + remote); say it the same way. */
function workModeLine(modes: string[]): string | null {
  const set = new Set(modes.map((m) => m.toLowerCase()));
  if (set.has("onsite")) return "On-site, and open to hybrid or remote";
  if (set.has("hybrid")) return "Hybrid, and open to remote";
  if (set.has("remote")) return "Remote";
  return null;
}

function Section({
  title,
  count,
  children,
  className,
}: {
  title: string;
  count?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("py-6 first:pt-0 last:pb-0", className)}>
      <h2 className="flex items-baseline justify-between gap-3 text-lg font-semibold tracking-[-0.01em] text-ink-900">
        {title}
        {count ? <span className="nums text-sm font-normal text-text-subtle">{count}</span> : null}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ProfileView({
  name,
  initials,
  photoUrl,
  status,
  score,
  ratings,
  draft,
  aiLinks,
}: {
  name: string;
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
  const byLabel = new Map(ratings);
  const dialAxes = {
    communication: byLabel.get("Communication") ?? null,
    coding: byLabel.get("Coding") ?? null,
    aptitude: byLabel.get("Aptitude") ?? null,
    interview: byLabel.get("AI interview") ?? null,
  };

  return (
    <div className="space-y-6">
      <EmployerCard initials={initials} place={place} score={score} skills={skills} />
      {/* ── Header: who you are, how you score, whether you are live ── */}
      <Surface as="section" aria-label="Profile summary" className="p-5 lg:p-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 max-w-xl">
            <div className="flex items-center gap-4">
              <InternAvatar src={photoUrl} initials={initials} className="size-16 rounded-full text-xl" />
              <div className="min-w-0 flex-1">
                <h2 className="min-w-0 max-w-full text-3xl font-medium leading-[1.08] tracking-[-0.03em] text-ink-900 [overflow-wrap:anywhere]">{name}</h2>
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-ink-600 [overflow-wrap:anywhere]">
                  <MapPin className="size-4 shrink-0 text-text-subtle" aria-hidden />
                  {place || "City not added yet"}
                </p>
              </div>
            </div>
            <div className="mt-4"><Pill tone={status.tone}>{status.label}</Pill></div>
            <p className="mt-3 max-w-prose text-pretty text-sm leading-relaxed text-ink-600">{status.detail}</p>
            {score !== null ? <p className="mt-3 max-w-prose text-pretty text-sm leading-relaxed text-ink-800">{bandRateLine(score)}</p> : null}
          </div>
          {score !== null ? (
            <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col">
              <ScoreDial score={score} axes={dialAxes} size="lg" />
              <dl className="grid w-full min-w-48 gap-y-2 text-sm">
                {AXIS_LEGEND.map(([label, key]) => (
                  <div key={key} className="flex items-baseline justify-between gap-6 border-b border-ink-100 pb-2 last:border-0 last:pb-0">
                    <dt className="text-text-subtle">{label}</dt>
                    <dd className="nums font-medium text-ink-900">
                      {typeof dialAxes[key] === "number" ? (
                        <>{dialAxes[key]!.toFixed(1)}<span className="ml-0.5 font-normal text-text-subtle">/10</span></>
                      ) : (
                        <span className="font-normal text-text-subtle">Not scored</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="max-w-56 text-sm text-text-subtle">Your score and its four axes appear after your AI interview.</p>
          )}
        </div>
      </Surface>

      <Surface className="px-5 py-6 lg:px-8 [&>*]:border-b [&>*]:border-ink-100 [&>*]:py-6 [&>*]:first:pt-0 [&>*:last-child]:border-0 [&>*:last-child]:pb-0">
      {/* ── Skills ──────────────────────────────────────────────── */}
      <Section title="Skills" count={`${Math.min(skills.length, 7)}/7`}>
        {skills.length === 0 ? (
          <p className="text-sm text-ink-600">No skills added yet. Employers filter candidates by skill first.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <li key={skill} className="inline-flex min-h-9 max-w-full items-center rounded-full bg-ink-50 px-3 py-1 text-sm">
                <span className="min-w-0 font-medium text-ink-900 [overflow-wrap:anywhere]">{skill}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Score and the AI interview ──────────────────────────── */}
      {aiLinks.feedbackLink || aiLinks.recordingLink ? (
        <Section title="AI interview">
          {aiLinks.feedbackLink || aiLinks.recordingLink ? (
            <div className="flex flex-wrap gap-2">
              {aiLinks.feedbackLink ? (
                <a href={aiLinks.feedbackLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
                  Feedback report
                  <span className="sr-only"> (opens in a new tab)</span>
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              ) : null}
              {aiLinks.recordingLink ? (
                <a href={aiLinks.recordingLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
                  Recording
                  <span className="sr-only"> (opens in a new tab)</span>
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* ── About ───────────────────────────────────────────────── */}
      {/* ── Where and how ───────────────────────────────────────── */}
      <Section title="Work preferences">
        <dl className="divide-y divide-ink-100">
          <DetailRow label="Work mode" value={modes ?? "Not chosen yet"} />
          <DetailRow
            label="Preferred cities"
            value={draft.preferredLocations.length > 0 ? uniqueCi(draft.preferredLocations).join(", ") : modes === "Remote" ? "Remote only" : "None added"}
          />
          <DetailRow
            label="Laptop"
            value={draft.hasLaptop === null ? "Not stated" : draft.hasLaptop ? "Has a laptop" : "Needs one provided"}
          />
        </dl>
      </Section>

      {/* ── Academics ───────────────────────────────────────────── */}
      {a.institution || a.degree ? (
        <Section title="Academics">
          <dl className="divide-y divide-ink-100">
            <DetailRow label="Institution" value={a.institution || "Not stated"} />
            <DetailRow label="Degree" value={[a.degree, a.branch].filter(Boolean).join(", ") || "Not stated"} />
            <DetailRow label="Years" mono value={[a.startYear, a.yearOfGraduation].filter(Boolean).join(" – ") || "Not stated"} />
            {a.cgpa ? (
              <DetailRow label={a.scoreType === "percentage" ? "Percentage" : "CGPA"} mono value={a.scoreType === "percentage" ? `${a.cgpa}%` : `${a.cgpa} / 10`} />
            ) : null}
            {a.status ? <DetailRow label="Status" value={a.status.charAt(0).toUpperCase() + a.status.slice(1)} /> : null}
          </dl>
        </Section>
      ) : null}

      {/* ── Experience ──────────────────────────────────────────── */}
      {experiences.length > 0 ? (
        <Section title="Experience and projects">
          <ul className="divide-y divide-ink-100">
            {experiences.map((exp) => (
              <li key={exp.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-base font-medium text-ink-900 [overflow-wrap:anywhere]">{[exp.role, exp.company].filter(Boolean).join(" · ")}</p>
                <p className="nums mt-1 text-sm text-ink-600 [overflow-wrap:anywhere]">
                  {[exp.type, [dateLabel(exp.from), exp.current ? "Present" : dateLabel(exp.to)].filter(Boolean).join(" – ")]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {exp.description ? (
                  <p className="mt-2 whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-700 [overflow-wrap:anywhere]">{exp.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
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
        <div className={cn("grid gap-6", languages.length > 0 && activities.length > 0 && "sm:grid-cols-2")}>
          {languages.length > 0 ? (
            <Section title="Languages">
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
            <Section title="Extracurriculars">
              <ul className="space-y-2">
                {activities.map((x) => (
                  <li key={x.id} className="text-sm [overflow-wrap:anywhere]">
                    <span className="font-medium text-ink-900">{x.activity}</span>
                    {x.level || x.category ? (
                      <span className="text-ink-600"> · {[x.category, x.level].filter(Boolean).join(", ")}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      ) : null}
      </Surface>
    </div>
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
