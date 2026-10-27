import {
  BookOpen,
  Briefcase,
  ExternalLink,
  GraduationCap,
  Languages,
  Laptop,
  MapPin,
  Sparkles,
  Trophy,
  Video,
} from "lucide-react";

import { DetailRow, EmptyScene, Pill, Surface, type Tone } from "@/components/app/primitives";
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
  return LEVEL_LABEL[raw] ?? (raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "Beginner");
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
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Surface as="section" className={cn("p-5 sm:p-6", className)}>
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-[-0.01em] text-ink-900">
        <Icon className="size-4 text-brand-700" aria-hidden />
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
    <div className="space-y-5">
      {/* ── Identity: the focal point ───────────────────────────── */}
      <Surface as="section" aria-label="Profile summary" className="overflow-hidden">
        <div className="flex flex-wrap items-start gap-5 p-5 sm:p-7">
          <InternAvatar src={photoUrl} initials={initials} className="size-20 rounded-apple-lg text-2xl" />
          <div className="min-w-0 flex-1 basis-56">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl font-semibold tracking-[-0.02em] text-ink-900">{name}</p>
              <Pill tone={status.tone}>{status.label}</Pill>
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-600">
              <MapPin className="size-4 shrink-0 text-ink-400" aria-hidden />
              {place || "City not added yet"}
            </p>
            <p className="mt-3 max-w-prose text-pretty text-sm leading-relaxed text-ink-600">{status.detail}</p>
          </div>
          <div className="w-full shrink-0 rounded-apple-lg bg-brand-950 px-5 py-4 text-white sm:w-auto sm:min-w-44">
            <p className="text-sm text-on-dark-subtle">Findtern Score</p>
            {score === null ? (
              <p className="mt-1.5 text-base font-medium text-white/85">After your AI interview</p>
            ) : (
              <p className="nums mt-1 text-3xl font-semibold tracking-[-0.02em]">
                {score.toFixed(1)}
                <span className="ml-0.5 text-base font-normal text-on-dark-subtle">/10</span>
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-ink-100 bg-ink-50/50 px-5 py-4 sm:px-7">
          <p className="text-sm text-ink-700">
            <span className="font-medium text-ink-900">Before a hire, employers see</span> your initials{" "}
            <span className="nums inline-grid size-7 place-items-center rounded-full bg-brand-50 align-middle text-xs font-semibold text-brand-800">
              {initials}
            </span>{" "}
            and city, never your name, photo, LinkedIn or contact details.
          </p>
        </div>
      </Surface>

      {/* ── Skills ──────────────────────────────────────────────── */}
      <Section icon={Sparkles} title="Skills">
        {skills.length === 0 ? (
          <p className="text-sm text-ink-600">No skills added yet. Employers filter candidates by skill first.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {skills.map((skill) => (
              <li
                key={skill}
                className="flex min-h-11 items-center justify-between gap-3 rounded-apple-md border border-ink-200/80 px-3.5 py-2"
              >
                <span className="truncate text-sm font-medium text-ink-900">{skill}</span>
                <span className="shrink-0 text-xs font-medium text-ink-600">
                  {levelOf(ratingByName.get(skill.toLowerCase().trim()))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Score and the AI interview ──────────────────────────── */}
      {ratings.length > 0 || aiLinks.feedbackLink || aiLinks.recordingLink ? (
        <Section icon={Video} title="AI interview">
          {ratings.length > 0 ? (
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {ratings.map(([label, v]) => (
                <div key={label}>
                  <div className="flex justify-between gap-2 text-sm">
                    <dt className="text-ink-600">{label}</dt>
                    <dd className="nums font-semibold text-ink-900">{v.toFixed(1)}</dd>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, v * 10)}%` }} />
                  </div>
                </div>
              ))}
            </dl>
          ) : null}
          {aiLinks.feedbackLink || aiLinks.recordingLink ? (
            <div className={cn("flex flex-wrap gap-2", ratings.length > 0 && "mt-5 border-t border-ink-100 pt-4")}>
              {aiLinks.feedbackLink ? (
                <a href={aiLinks.feedbackLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
                  Feedback report
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              ) : null}
              {aiLinks.recordingLink ? (
                <a href={aiLinks.recordingLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
                  Recording
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* ── About ───────────────────────────────────────────────── */}
      {draft.bio ? (
        <Section icon={BookOpen} title="About">
          <p className="whitespace-pre-line text-pretty text-[0.9375rem] leading-relaxed text-ink-700">{draft.bio}</p>
        </Section>
      ) : null}

      {/* ── Where and how ───────────────────────────────────────── */}
      <Section icon={Laptop} title="Work preferences">
        <dl className="divide-y divide-ink-100">
          <DetailRow label="Work mode" value={modes ?? "Not chosen yet"} />
          <DetailRow
            label="Preferred cities"
            value={draft.preferredLocations.length > 0 ? draft.preferredLocations.join(", ") : modes === "Remote" ? "Remote only" : "None added"}
          />
          <DetailRow
            label="Laptop"
            value={draft.hasLaptop === null ? "Not stated" : draft.hasLaptop ? "Has a laptop" : "Needs one provided"}
          />
        </dl>
      </Section>

      {/* ── Academics ───────────────────────────────────────────── */}
      {a.institution || a.degree ? (
        <Section icon={GraduationCap} title="Academics">
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
        <Section icon={Briefcase} title="Experience and projects">
          <ul className="divide-y divide-ink-100">
            {experiences.map((exp) => (
              <li key={exp.id} className="py-3.5 first:pt-0 last:pb-0">
                <p className="text-[0.9375rem] font-medium text-ink-900">{[exp.role, exp.company].filter(Boolean).join(" · ")}</p>
                <p className="nums mt-0.5 text-sm text-ink-600">
                  {[exp.type, [dateLabel(exp.from), exp.current ? "Present" : dateLabel(exp.to)].filter(Boolean).join(" – ")]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {exp.description ? (
                  <p className="mt-1.5 whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-700">{exp.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* ── Courses and certifications ──────────────────────────── */}
      {qualifications.length > 0 ? (
        <Section icon={Trophy} title="Courses and certifications">
          <ul className="divide-y divide-ink-100">
            {qualifications.map((q) => (
              <li key={q.id} className="py-3.5 first:pt-0 last:pb-0">
                <p className="text-[0.9375rem] font-medium text-ink-900">{q.name}</p>
                <p className="nums mt-0.5 text-sm text-ink-600">
                  {[q.issuer, q.completionDate && dateLabel(q.completionDate)].filter(Boolean).join(" · ") || "No further detail"}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* ── Languages and activities ────────────────────────────── */}
      {languages.length > 0 || activities.length > 0 ? (
        <div className={cn("grid gap-5", languages.length > 0 && activities.length > 0 && "sm:grid-cols-2")}>
          {languages.length > 0 ? (
            <Section icon={Languages} title="Languages">
              <ul className="space-y-2.5">
                {languages.map((l) => (
                  <li key={l.id} className="text-sm">
                    <span className="font-medium capitalize text-ink-900">{l.language}</span>
                    <span className="text-ink-600">
                      {" "}
                      · {[l.level, l.read && "read", l.write && "write", l.speak && "speak"].filter(Boolean).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {activities.length > 0 ? (
            <Section icon={Trophy} title="Extracurriculars">
              <ul className="space-y-2.5">
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
