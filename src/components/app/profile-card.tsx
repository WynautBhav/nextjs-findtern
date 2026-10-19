"use client";

/**
 * The candidate profile card, rendered on the home screen.
 *
 * Built on the Watermelon expandable-profile-card with Findtern's signature
 * emerald-gradient identity, glowing verification accents, and structured
 * recruiter fact cards.
 */

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  ExternalLink,
  GraduationCap,
  Languages as LanguagesIcon,
  MapPin,
  Sparkles,
  Star,
  Trophy,
  UserCheck,
  Video,
} from "lucide-react";

import { Pill } from "@/components/app/primitives";
import type { Stage } from "@/lib/journey";

/**
 * The expandable card measures layout on mount (framer-motion `layoutId`),
 * which races hydration and fails it flakily (~50% of loads on this page and
 * the dashboard, same shared component). Intern pages are robots-noindex, so
 * server-rendering this interactive widget buys nothing: it renders client-side
 * only, behind a same-height skeleton so nothing below it shifts.
 */
const ExpandableProfileCard = dynamic(
  () => import("@/components/watermelon/expandable-profile-card"),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="h-64 w-full animate-pulse overflow-hidden rounded-xl border border-ink-200/70 bg-ink-100"
      />
    ),
  },
);

export type SkillWithRating = {
  name: string;
  rating?: number | string;
};

export type ExperienceItem = {
  role?: string;
  company?: string;
  from?: string;
  to?: string;
  description?: string;
  type?: string;
};

export type LanguageItem = {
  language?: string;
  level?: string;
  read?: boolean | string;
  speak?: boolean | string;
  write?: boolean | string;
};

export type ExtracurricularItem = {
  activity?: string;
  level?: string;
};

export type ProfileCardProps = {
  name: string;
  initials: string;
  stage: Stage;
  city?: string | null;
  state?: string | null;
  bio?: string | null;
  skills: string[];
  skillsWithRatings?: SkillWithRating[];
  experiences?: ExperienceItem[];
  languages?: LanguageItem[];
  extracurriculars?: ExtracurricularItem[];
  aiFeedbackLink?: string | null;
  aiRecordingLink?: string | null;
  degree?: string | null;
  institution?: string | null;
  yearOfGraduation?: string | null;
  cgpa?: string | null;
  openToWork?: boolean;
};

function parseSkillLevel(r: unknown): { rating: number; label: string } {
  if (typeof r === "number") {
    const rating = Math.max(1, Math.min(3, Math.round(r)));
    return { rating, label: rating === 3 ? "Advanced" : rating === 2 ? "Intermediate" : "Beginner" };
  }
  const s = String(r ?? "").toLowerCase().trim();
  if (s.includes("adv")) return { rating: 3, label: "Advanced" };
  if (s.includes("inter")) return { rating: 2, label: "Intermediate" };
  const n = parseInt(s, 10);
  if (!isNaN(n)) {
    const rating = Math.max(1, Math.min(3, n));
    return { rating, label: rating === 3 ? "Advanced" : rating === 2 ? "Intermediate" : "Beginner" };
  }
  return { rating: 1, label: "Beginner" };
}

export function ProfileCard({
  name,
  initials,
  stage,
  city,
  state,
  bio,
  skills,
  skillsWithRatings = [],
  experiences = [],
  languages = [],
  extracurriculars = [],
  aiFeedbackLink,
  aiRecordingLink,
  degree,
  institution,
  yearOfGraduation,
  cgpa,
}: ProfileCardProps) {
  const place = [city, state].filter(Boolean).join(", ");

  // Normalise skills list with optional star ratings
  const ratingsMap = new Map<string, { rating: number; label: string }>();
  for (const s of skillsWithRatings) {
    if (s.name) ratingsMap.set(s.name.toLowerCase().trim(), parseSkillLevel(s.rating));
  }

  const hero = (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-teal-950 p-5 text-white sm:p-6">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-emerald-500/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 size-48 rounded-full bg-brand-500/20 blur-2xl" />

      {/* Top row: Avatar + Verified Badge + Status Tag */}
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="relative">
            <span className="grid size-14 place-items-center rounded-[14px] bg-gradient-to-br from-brand-700/60 to-emerald-600/40 text-lg font-bold tracking-[-0.01em] text-white ring-1 ring-white/20 shadow-[0_4px_16px_rgb(0_0_0/0.3)]">
              {initials}
            </span>
            <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-accent-500 text-brand-950 ring-2 ring-brand-950 shadow-xs">
              <Sparkles className="size-2.5" />
            </span>
          </div>

          <div className="min-w-0">
            <Pill
              tone="neutral"
              className="whitespace-nowrap border border-white/15 bg-white/10 text-accent-300 backdrop-blur-xs"
            >
              <UserCheck className="size-3 text-accent-400" aria-hidden />
              <span>Verified candidate</span>
            </Pill>
            {place && (
              <p className="mt-1 flex items-center gap-1 text-xs text-on-dark-subtle">
                <MapPin className="size-3 text-accent-400 shrink-0" />
                <span className="truncate">{place}</span>
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 whitespace-nowrap rounded-[10px] border border-white/15 bg-white/10 px-3 py-1.5 text-right backdrop-blur-xs">
          <span className="text-xs uppercase tracking-wider text-accent-300 font-semibold block">
            Status
          </span>
          <span className="text-xs font-bold text-white">
            {stage === "working" ? "Placed Intern" : "Actively Seeking"}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <ExpandableProfileCard
      title={name}
      subtitle={stage === "working" ? "Working Intern · Live Project" : "Open for Placement · Ready for Interviews"}
      hero={hero}
      content={
        <div className="flex flex-col gap-6">
          {bio ? (
            <p className="text-pretty leading-relaxed text-ink-700">{bio}</p>
          ) : (
            <p className="text-pretty leading-relaxed text-ink-600">
              No bio yet. A line or two about what you do well is the part a recruiter reads out loud.
            </p>
          )}

          {/* Verified Skills with Star Proficiencies */}
          {skills.length > 0 ? (
            <div>
              <h4 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <Sparkles className="size-4 text-accent-500" aria-hidden />
                Skills & Proficiencies
              </h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {skills.map((skill) => {
                  const level = ratingsMap.get(skill.toLowerCase().trim()) ?? { rating: 1, label: "Beginner" };
                  return (
                    <div
                      key={skill}
                      className="flex items-center justify-between gap-3 rounded-[10px] border border-ink-200/70 bg-ink-50/50 px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-ink-800 truncate">{skill}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-0.5" aria-label={`${level.label} proficiency`}>
                          {[1, 2, 3].map((star) => (
                            <Star
                              key={star}
                              className={`size-3 ${
                                star <= level.rating
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-ink-300"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-2xs text-text-subtle font-medium">{level.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Experience History */}
          {experiences.length > 0 ? (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <Briefcase className="size-4 text-brand-600" aria-hidden />
                Work & Internship Experience
              </h4>
              <div className="space-y-2.5">
                {experiences.map((exp, idx) => (
                  <div
                    key={`${exp.company}-${idx}`}
                    className="rounded-[10px] border border-ink-200/70 bg-white p-3 shadow-2xs"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-1">
                      <p className="text-xs font-semibold text-ink-900">{exp.role || "Intern"}</p>
                      <span className="text-2xs tabular-nums text-text-subtle">
                        {[exp.from, exp.to].filter(Boolean).join(" – ") || "Recent"}
                      </span>
                    </div>
                    {exp.company ? (
                      <p className="text-2xs font-medium text-brand-700">{exp.company}</p>
                    ) : null}
                    {exp.description ? (
                      <p className="mt-1.5 text-xs text-ink-600 leading-relaxed whitespace-pre-wrap">
                        {exp.description}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Academics & Education */}
          {degree || institution ? (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <GraduationCap className="size-4 text-brand-600" aria-hidden />
                Academics & Education
              </h4>
              <p className="text-sm leading-relaxed text-ink-700 tabular-nums">
                {[
                  degree,
                  institution,
                  yearOfGraduation ? `Class of ${yearOfGraduation}` : null,
                  cgpa ? `CGPA ${cgpa}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          ) : null}

          {/* Languages */}
          {languages.length > 0 ? (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <LanguagesIcon className="size-4 text-brand-600" aria-hidden />
                Languages
              </h4>
              <div className="flex flex-wrap gap-2">
                {languages.map((l, idx) => {
                  const caps = [
                    l.read ? "Read" : null,
                    l.speak ? "Speak" : null,
                    l.write ? "Write" : null,
                  ].filter(Boolean).join(" · ");
                  return (
                    <div
                      key={`${l.language}-${idx}`}
                      className="rounded-[10px] border border-ink-200/70 bg-ink-50/50 px-3 py-1.5 text-xs"
                    >
                      <span className="font-semibold text-ink-800 capitalize">{l.language}</span>
                      {l.level ? (
                        <span className="ml-1 text-text-subtle">({l.level})</span>
                      ) : null}
                      {caps ? (
                        <span className="block text-2xs text-text-subtle mt-0.5">{caps}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Extracurriculars */}
          {extracurriculars.length > 0 ? (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <Trophy className="size-4 text-accent-500" aria-hidden />
                Extracurricular Activities
              </h4>
              <ul className="space-y-1.5 text-xs text-ink-700">
                {extracurriculars.map((a, idx) => (
                  <li key={`${a.activity}-${idx}`} className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-brand-600 shrink-0" />
                    <span className="font-medium text-ink-900">{a.activity}</span>
                    {a.level ? <span className="text-text-subtle">({a.level})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* AI Interview Feedback & Recording Quick Links */}
          {aiFeedbackLink || aiRecordingLink ? (
            <div className="rounded-[14px] border border-brand-200/80 bg-brand-50/40 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-brand-700" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-900">
                  AI Interview Evaluation
                </h4>
              </div>
              <p className="mt-1 text-xs text-brand-800/80">
                Your AI interview report and session recording are available.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {aiFeedbackLink ? (
                  <a
                    href={aiFeedbackLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="apple-spring apple-pressable inline-flex min-h-9 items-center gap-1.5 rounded-[8px] bg-brand-700 px-3 text-xs font-semibold text-white hover:bg-brand-800"
                  >
                    <span>View Feedback Report</span>
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}
                {aiRecordingLink ? (
                  <a
                    href={aiRecordingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="apple-spring apple-pressable inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-brand-300 bg-white px-3 text-xs font-medium text-brand-800 hover:bg-brand-50"
                  >
                    <Video className="size-3" />
                    <span>View Recording</span>
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {place ? (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <MapPin className="size-4 text-brand-600" aria-hidden />
                Based in
              </h4>
              <p className="text-sm text-ink-700">{place}</p>
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-3 border-t border-ink-100 pt-5">
            <Link
              href="/intern/onboarding"
              className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-5 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover"
            >
              <span>Edit your profile</span>
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
            <Link
              href="/intern/record"
              className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-ink-200 bg-white px-5 text-xs font-medium text-ink-700 hover:bg-ink-50"
            >
              <BadgeCheck className="size-3.5 text-brand-600" aria-hidden />
              <span>See verified record</span>
            </Link>
          </div>
        </div>
      }
    />
  );
}
