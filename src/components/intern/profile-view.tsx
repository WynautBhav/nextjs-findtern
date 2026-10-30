import { ExternalLink, MapPin } from "lucide-react";

import { DetailRow, EmptyScene, LIGHT_TILE, Pill, Surface, type Tone } from "@/components/app/primitives";
import { ScoreScale } from "@/components/app/tiles";
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

export type ProfileStatus = { tone: Tone; label: string; detail: string };

const LEVEL_LABEL: Record<string, string> = { "1": "Beginner", "2": "Intermediate", "3": "Advanced" };

function levelOf(rating: unknown): string {
  const raw = String(rating ?? "").trim();
  return LEVEL_LABEL[raw] ?? (raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "Not rated");
}

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
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Surface as="section" className={cn("p-5 lg:p-6", className)}>
      <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </Surface>
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
  const ratingByName = new Map(draft.skillsWithRatings.map((s) => [s.name.toLowerCase().trim(), s.rating]));
  const skills = draft.skills.filter(Boolean);
  const a = draft.academics;
  const experiences = draft.experiences.filter((e) => e.company || e.role);
  const qualifications = [...a.professional, ...a.certifications].filter((q) => q.name);
  const languages = draft.languages.filter((l) => l.language);
  const activities = draft.extracurriculars.filter((x) => x.activity);
  const modes = workModeLine(draft.locationTypes);

  return (
    <div className="space-y-6">
      {/* ── Identity: the focal point ───────────────────────────── */}
      <Surface as="section" aria-label="Profile summary" className="overflow-hidden">
        <div className="flex flex-wrap items-start gap-4 p-5 lg:p-6">
          <InternAvatar src={photoUrl} initials={initials} className="size-20 rounded-apple-lg text-2xl" />
          <div className="min-w-0 flex-1 basis-48">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl font-semibold tracking-[-0.02em] text-ink-900">{name}</p>
              <Pill tone={status.tone}>{status.label}</Pill>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600">
              <MapPin className="size-4 shrink-0 text-text-subtle" aria-hidden />
              {place || "City not added yet"}
            </p>
            <p className="mt-3 max-w-prose text-pretty text-sm leading-relaxed text-ink-600">{status.detail}</p>
          </div>
          {/* With a score, it lives on the card below (one figure, one place). */}
          {score === null ? (
            <div className="w-full shrink-0 rounded-apple-lg bg-ink-50 p-4 sm:w-auto sm:min-w-44">
              <p className="text-sm text-text-subtle">Findtern Score</p>
              <p className="mt-1 text-base font-medium text-ink-700">After your AI interview</p>
            </div>
          ) : null}
        </div>

        {/* The anonymous card itself, built from this profile: what an employer sees before a hire. */}
        <div className="grid gap-5 border-t border-ink-100 bg-ink-50/50 px-5 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:items-center lg:px-6">
          <p className="text-pretty text-sm leading-relaxed text-ink-700">
            <span className="font-medium text-ink-900">Before a hire, employers see this card.</span> Your initials and city,
            never your name, photo, LinkedIn or contact details.
          </p>
          <div aria-label="What employers see" role="group" className={cn("rounded-apple-lg border border-ink-200/80 bg-white p-4", LIGHT_TILE)}>
            <div className="flex items-center gap-3">
              <span className="nums grid size-11 shrink-0 place-items-center rounded-full bg-brand-700 text-sm font-semibold text-white">{initials}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900">Candidate {initials}</p>
                <p className="truncate text-xs text-ink-600">{place || "City not added yet"}</p>
              </div>
              {score !== null ? (
                <p className="nums text-right text-2xl font-medium leading-none tracking-[-0.03em] text-brand-700">
                  {score.toFixed(1)}
                  <span className="ml-0.5 text-xs font-normal tracking-normal text-text-subtle">/10</span>
                </p>
              ) : null}
            </div>
            {skills.length > 0 ? (
              <p className="mt-3 truncate text-xs text-ink-700">
                {skills.slice(0, 4).join(" · ")}
                {skills.length > 4 ? <span className="text-text-subtle"> +{skills.length - 4}</span> : null}
              </p>
            ) : null}
          </div>
        </div>
      </Surface>

      {/* ── Skills ──────────────────────────────────────────────── */}
      <Section title="Skills">
        {skills.length === 0 ? (
          <p className="text-sm text-ink-600">No skills added yet. Employers filter candidates by skill first.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <li key={skill} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-ink-200/80 px-3 text-sm">
                <span className="font-medium text-ink-900">{skill}</span>
                <span className="text-xs text-text-subtle">{levelOf(ratingByName.get(skill.toLowerCase().trim()))}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Score and the AI interview ──────────────────────────── */}
      {ratings.length > 0 || aiLinks.feedbackLink || aiLinks.recordingLink ? (
        <Section title="AI interview">
          {ratings.length > 0 ? (
            // The same scale Home draws these on, so the two pages never disagree.
            <ScoreScale rows={ratings.map(([label, value]) => ({ label, value }))} />
          ) : null}
          {aiLinks.feedbackLink || aiLinks.recordingLink ? (
            <div className={cn("flex flex-wrap gap-2", ratings.length > 0 && "mt-4 border-t border-ink-100 pt-4")}>
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
      {draft.bio ? (
        <Section title="About">
          <p className="whitespace-pre-line text-pretty text-base leading-relaxed text-ink-700">{draft.bio}</p>
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
                <p className="text-base font-medium text-ink-900">{[exp.role, exp.company].filter(Boolean).join(" · ")}</p>
                <p className="nums mt-1 text-sm text-ink-600">
                  {[exp.type, [dateLabel(exp.from), exp.current ? "Present" : dateLabel(exp.to)].filter(Boolean).join(" – ")]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {exp.description ? (
                  <p className="mt-2 whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-700">{exp.description}</p>
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
                <p className="text-base font-medium text-ink-900">{q.name}</p>
                <p className="nums mt-1 text-sm text-ink-600">
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
                  <li key={l.id} className="text-sm">
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
                  <li key={x.id} className="text-sm">
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
