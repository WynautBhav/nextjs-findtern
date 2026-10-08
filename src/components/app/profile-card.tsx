"use client";

/**
 * The candidate profile card, rendered on the home screen.
 *
 * Built on the Watermelon expandable-profile-card with Findtern's signature
 * emerald-gradient identity, glowing verification accents, and structured
 * recruiter fact cards.
 */

import Link from "next/link";
import { ArrowRight, BadgeCheck, GraduationCap, MapPin, Sparkles, UserCheck } from "lucide-react";

import ExpandableProfileCard from "@/components/watermelon/expandable-profile-card";
import { Pill } from "@/components/app/primitives";
import type { Stage } from "@/lib/journey";

export type ProfileCardProps = {
  name: string;
  initials: string;
  stage: Stage;
  city?: string | null;
  state?: string | null;
  bio?: string | null;
  skills: string[];
  degree?: string | null;
  institution?: string | null;
  yearOfGraduation?: string | null;
  cgpa?: string | null;
  openToWork?: boolean;
};

export function ProfileCard({
  name,
  initials,
  stage,
  city,
  state,
  bio,
  skills,
  degree,
  institution,
  yearOfGraduation,
  cgpa,
}: ProfileCardProps) {
  const place = [city, state].filter(Boolean).join(", ");

  const hero = (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-teal-950 p-6 sm:p-7 text-white">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-emerald-500/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 size-48 rounded-full bg-brand-500/20 blur-2xl" />

      {/* Top row: Avatar + Verified Badge + Status Tag */}
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-700/60 to-emerald-600/40 text-lg font-bold text-white ring-2 ring-emerald-400/40 shadow-lg backdrop-blur-md">
              {initials}
            </span>
            <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-accent-500 text-brand-950 ring-2 ring-brand-950 shadow-xs">
              <Sparkles className="size-2.5" />
            </span>
          </div>

          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-3xs font-semibold uppercase tracking-wider text-accent-300 border border-white/15 backdrop-blur-xs">
              <UserCheck className="size-3 text-accent-400" />
              <span>Verified Candidate</span>
            </div>
            {place && (
              <p className="mt-1 flex items-center gap-1 text-2xs text-on-dark-subtle">
                <MapPin className="size-3 text-accent-400 shrink-0" />
                <span className="truncate">{place}</span>
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-1.5 backdrop-blur-xs text-right">
          <span className="text-3xs uppercase tracking-wider text-accent-300 font-semibold block">
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
            <p className="text-pretty leading-relaxed text-ink-500">
              No bio yet. A line or two about what you do well is the part a recruiter reads out loud.
            </p>
          )}

          {skills.length > 0 ? (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <Sparkles className="size-4 text-accent-500" aria-hidden />
                Verified Skills
              </h4>
              <ul className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <li key={skill}>
                    <Pill tone="neutral">{skill}</Pill>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {degree || institution ? (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <GraduationCap className="size-4 text-brand-600" aria-hidden />
                Academics & Education
              </h4>
              <p className="text-sm leading-relaxed text-ink-700">
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
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-hover active:scale-[0.99]"
            >
              <span>Edit your profile</span>
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
            <Link
              href="/intern/record"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sand-300 px-5 text-xs font-medium text-ink-700 transition hover:bg-sand-50"
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
