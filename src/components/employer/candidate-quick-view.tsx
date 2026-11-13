"use client";

import { Eye, GraduationCap, MapPin } from "lucide-react";

import { formatMoney } from "@/lib/format";
import { HOURS_PER_MONTH } from "@/lib/plan-offer";
import { RATING_META, type CandidateProfile } from "@/lib/employer-candidates";
import type { Currency, Pricing } from "@/lib/employer-pricing";
import { bandFor, planNameFor } from "@/lib/score";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { SkillChips } from "@/components/employer/candidate-row-parts";
import { skillMatch } from "@/components/app/skill-match";
import { studyOf } from "@/components/employer/candidate-view";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * "Quick view" on a candidate card: the profile the list already holds, in a
 * dialog, so an employer can read it without leaving the list. Nothing is
 * fetched. The candidate is the redacted one the card was given (initials until
 * hire, no email, no LinkedIn, no recording), and the only money shown is the
 * employer's own hourly rate, never what the intern is paid.
 */
export function CandidateQuickView({
  candidate,
  displayName,
  place,
  currency,
  pricing,
  wantedSkills = [],
  profileHref,
  className,
}: {
  candidate: CandidateProfile;
  displayName: string;
  place: string;
  currency: Currency;
  pricing: Pricing;
  wantedSkills?: string[];
  profileHref: string;
  /** Classes for the trigger button. */
  className?: string;
}) {
  const study = studyOf(candidate.academics);
  const academics = candidate.academics;
  const years = academics ? [academics.startYear, academics.endYear].filter(Boolean).join(" – ") : "";
  const wanted = skillMatch(candidate.skills, wantedSkills);
  const rated = RATING_META.map((m) => ({ label: m.label, value: candidate.ratings[m.key] })).filter((r) => r.value > 0);
  const monthly = pricing.hourlyRateMinor > 0 ? formatMoney(pricing.hourlyRateMinor * HOURS_PER_MONTH, currency) : "";
  const box = "rounded-xl border border-ink-200 bg-ink-50 p-3";
  const label = "text-[11px] font-semibold uppercase tracking-wider text-text-subtle";

  return (
    <Dialog>
      <DialogTrigger
        aria-label={`Quick view of ${displayName}`}
        className={cn(buttonClass({ variant: "ghost", size: "sm", className: "relative z-10 h-11 rounded-xl sm:h-10 sm:touch:h-11" }), className)}
      >
        <Eye className="size-4" aria-hidden />
        Quick view
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-3 pr-8">
            <CandidateAvatar photoUrl={candidate.photoUrl} initials={candidate.initials} seed={candidate.id} className="size-14 rounded-2xl text-base ring-1 ring-inset ring-black/5" />
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold leading-6 text-ink-900">{displayName}</DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-1 text-sm text-ink-600">
                <MapPin className="size-3.5 shrink-0 text-ink-500" aria-hidden />
                {place}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className={box}>
            <p className={label}>Findtern Score</p>
            {candidate.scored ? (
              <p className="nums mt-1 text-2xl font-semibold leading-none text-brand-700">
                {candidate.score.toFixed(1)}
                <span className="ml-1 text-xs font-normal text-text-subtle">/ 10</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-700">Not scored yet</p>
            )}
            {candidate.scored ? <p className="mt-1 text-xs text-ink-600">{planNameFor(candidate.score)} · {bandFor(candidate.score).name}</p> : null}
          </div>
          <div className={box}>
            <p className={label}>Hourly rate</p>
            <p className="nums mt-1 text-xl font-bold leading-6 text-ink-900">
              {formatMoney(pricing.hourlyRateMinor, currency)}
              <span className="ml-1 text-xs font-normal text-text-subtle">/ hr</span>
            </p>
            {monthly ? <p className="nums mt-1 text-xs text-ink-600">≈ {monthly}/mo at {HOURS_PER_MONTH} hours</p> : null}
          </div>
          <div className={cn(box, "col-span-2 sm:col-span-1")}>
            <p className={label}>Availability</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">{candidate.workModes.join(" / ") || "Not stated"}</p>
            {candidate.hasLaptop ? <p className="mt-1 text-xs text-ink-600">Has own laptop</p> : null}
          </div>
        </div>

        <section aria-labelledby="qv-ai">
          <h3 id="qv-ai" className="text-sm font-semibold text-ink-900">
            AI interview
          </h3>
          {rated.length === 0 ? (
            <p className="mt-1 text-sm text-ink-600">No AI interview score yet.</p>
          ) : (
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2">
              {rated.map((r) => (
                <div key={r.label}>
                  <div className="flex items-baseline justify-between text-sm">
                    <dt className="text-ink-700">{r.label}</dt>
                    <dd className="nums">
                      <span className="font-semibold text-ink-900">{Math.min(10, r.value).toFixed(1)}</span>
                      <span className="text-text-subtle">/10</span>
                    </dd>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-200" aria-hidden>
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(10, r.value) * 10}%` }} />
                  </div>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section aria-labelledby="qv-skills">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 id="qv-skills" className="text-sm font-semibold text-ink-900">
              Skills
            </h3>
            {wanted.total > 0 ? (
              <p className="text-xs text-ink-600">
                <span className="nums font-medium text-ink-900">{wanted.matched.length} of {wanted.total}</span> you asked for
              </p>
            ) : null}
          </div>
          <SkillChips skills={candidate.skills} wanted={wantedSkills} className="mt-2" />
        </section>

        {study || academics?.institution ? (
          <section aria-labelledby="qv-edu" className="flex items-start gap-2">
            <GraduationCap className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            <div className="min-w-0">
              <h3 id="qv-edu" className="sr-only">
                Education
              </h3>
              {academics?.institution ? <p className="break-words text-sm font-medium text-ink-900">{academics.institution}</p> : null}
              <p className="nums break-words text-sm text-ink-600">{[study, years].filter(Boolean).join(" · ")}</p>
            </div>
          </section>
        ) : null}

        <DialogFooter className="sm:items-center">
          <DialogClose className={buttonClass({ variant: "light", size: "sm", className: "h-11 rounded-xl" })}>Close</DialogClose>
          <ButtonLink href={profileHref} variant="primary" size="sm" className="h-11 rounded-xl px-4">
            Open full profile
          </ButtonLink>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
