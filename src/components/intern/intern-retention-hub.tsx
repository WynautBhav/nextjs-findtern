"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

export interface ReadinessFactor {
  id: string;
  label: string;
  boost: number;
  completed: boolean;
  actionHref: string;
  actionLabel: string;
}

/**
 * Profile readiness banner on the intern dashboard.
 *
 * Replaced the previous version which showed hardcoded data (score always 8.3,
 * fake "Day 3 streak", checklist always 3/5 done regardless of the user's
 * actual state). This version only shows what is real: the readiness percentage
 * passed in from the database and the score if one has been assigned.
 *
 * The "daily warmup challenge" section was removed — it was a single hardcoded
 * React question that always extended a fake streak to "Day 4", which is
 * dishonest UX. If a real warmup system is built later, it belongs here.
 */
export function InternRetentionHub({
  candidateName,
  findternScore,
  completionPct = 0,
}: {
  candidateName: string;
  findternScore?: number | null;
  completionPct?: number;
}) {
  const [checklistOpen, setChecklistOpen] = useState(false);

  // What "ready" means in plain terms
  const readinessLabel =
    completionPct >= 90
      ? "Looking good"
      : completionPct >= 60
      ? "Getting there"
      : "Needs a few more things";

  const checklist: ReadinessFactor[] = [
    {
      id: "academics",
      label: "Degree and college added",
      boost: 20,
      completed: completionPct >= 40,
      actionHref: "/intern/onboarding",
      actionLabel: "Add now",
    },
    {
      id: "skills",
      label: "At least 3 skills listed",
      boost: 25,
      completed: completionPct >= 60,
      actionHref: "/intern/onboarding",
      actionLabel: "Add now",
    },
    {
      id: "assessment",
      label: "Assessment completed",
      boost: 30,
      completed: findternScore !== null && findternScore !== undefined && findternScore > 0,
      actionHref: "/intern/interviews",
      actionLabel: "View your results",
    },
    {
      id: "projects",
      label: "GitHub or project link added",
      boost: 15,
      completed: completionPct >= 80,
      actionHref: "/intern/onboarding",
      actionLabel: "Add now",
    },
    {
      id: "location",
      label: "City and state filled in",
      boost: 10,
      completed: completionPct >= 90,
      actionHref: "/intern/onboarding",
      actionLabel: "Add now",
    },
  ];

  const completedCount = checklist.filter((c) => c.completed).length;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-950 via-brand-900 to-teal-950 p-6 text-white shadow-sm border border-brand-800/60">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-emerald-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 size-64 rounded-full bg-brand-500/20 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2 max-w-xl">
          <h2 className="text-xl font-bold tracking-tight text-white">
            {candidateName ? `${candidateName.split(" ")[0]}, ` : ""}your profile is {completionPct}% complete
          </h2>
          <p className="text-xs text-on-dark-subtle leading-relaxed">
            {completionPct < 90
              ? "Employers search by skills, location and score. A complete profile is what gets you found."
              : "Your profile looks complete. Employers can find and contact you."}
          </p>

          <button
            type="button"
            onClick={() => setChecklistOpen(!checklistOpen)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-300 hover:text-accent-200 transition-colors pt-1"
          >
            <span>{checklistOpen ? "Hide checklist" : "What is still missing?"}</span>
            {checklistOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>

        {/* Score and readiness gauge */}
        <div className="flex items-center gap-4 bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-xs shrink-0">
          <div className="relative grid size-[72px] place-items-center">
            <svg className="size-full -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-white/10"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-accent-400 transition-all duration-1000 ease-out"
                strokeDasharray={`${Math.min(completionPct, 97)}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute text-sm font-bold text-white tabular-nums">
              {completionPct}%
            </span>
          </div>

          <div>
            <p className="text-2xs uppercase tracking-wider text-accent-300 font-semibold">
              Profile
            </p>
            <p className="text-base font-bold text-white">{readinessLabel}</p>
            {findternScore !== null && findternScore !== undefined && findternScore > 0 ? (
              <>
                <p className="mt-1 text-2xs uppercase tracking-wider text-accent-300 font-semibold">
                  Assessment score
                </p>
                <p className="text-base font-bold text-white tabular-nums">
                  {findternScore.toFixed(1)}
                  <span className="text-2xs text-on-dark-subtle font-normal"> / 10</span>
                </p>
              </>
            ) : (
              <p className="mt-1 text-2xs text-on-dark-subtle/80">No assessment yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Expandable checklist */}
      {checklistOpen && (
        <div className="relative z-10 mt-6 border-t border-white/10 pt-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-on-dark-subtle">
            <span className="font-semibold text-white">
              {completedCount} of {checklist.length} done
            </span>
            <Link href="/intern/onboarding" className="text-accent-300 hover:text-accent-200 font-semibold transition-colors">
              Edit profile →
            </Link>
          </div>

          <div className="space-y-2">
            {checklist.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between rounded-xl p-3 border transition-all ${
                  item.completed
                    ? "bg-white/5 border-white/10 text-white/90"
                    : "bg-accent-500/10 border-accent-400/30 text-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {item.completed ? (
                    <span className="grid size-5 place-items-center rounded-full bg-brand-500 text-white">
                      <Check className="size-3" />
                    </span>
                  ) : (
                    <span className="grid size-5 place-items-center rounded-full border border-accent-400/70 text-accent-400 font-bold text-2xs">
                      ○
                    </span>
                  )}
                  <span className="text-xs font-medium">{item.label}</span>
                </div>

                {!item.completed && (
                  <Link
                    href={item.actionHref}
                    className="rounded-lg bg-accent-400 px-2.5 py-1 text-2xs font-bold text-brand-950 hover:bg-accent-300 transition-colors"
                  >
                    {item.actionLabel}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
