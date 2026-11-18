import Link from "next/link";
import { ArrowRight, Check, GraduationCap, MapPin } from "lucide-react";

import type { Tone } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { VisibilityPill } from "@/components/intern/visibility-pill";
import { visibilityState } from "@/components/intern/visibility-state";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { bandFor, planNameFor } from "@/lib/score";
import { cn } from "@/lib/utils";
import { completionPct, nextAction, type Completion } from "./profile-logic";

export type ProfileStatus = { tone: Tone; label: string; detail: string };

/**
 * The head of the CV: who you are in one statement, with the Findtern Score as the one lead figure on the
 * right. It is the candidate's own view, so it carries the full name; the employer row is inside Visibility.
 * `badges` and `meta` are the two seams the old summary had (beside the status pill, under the college line).
 */
export function CvHeader({
  name,
  initials,
  photoUrl,
  degree,
  institution,
  place,
  status,
  badges,
  meta,
  score,
}: {
  name: string;
  initials: string;
  photoUrl: string | null;
  degree: string;
  institution: string;
  place: string;
  status: ProfileStatus;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  score: number | null;
}) {
  return (
    <div className="grid gap-x-10 gap-y-6 pb-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="flex min-w-0 items-start gap-4 sm:gap-5">
        <CandidateAvatar
          photoUrl={photoUrl}
          initials={initials}
          className="size-14 shrink-0 rounded-md text-lg sm:size-20 sm:text-2xl"
        />
        <div className="min-w-0">
          <p className="text-balance break-words font-display text-2xl font-semibold leading-tight text-ink-900 sm:text-4xl">{name}</p>
          {degree ? <p className="mt-1 text-pretty text-base font-medium text-ink-800">{degree}</p> : null}
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-700">
            {institution ? (
              <li className="flex items-start gap-1.5">
                <GraduationCap className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">{institution}</span>
              </li>
            ) : null}
            {place ? (
              <li className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">{place}</span>
              </li>
            ) : null}
            {!institution && !place ? <li>Add your college and city so employers can place you.</li> : null}
          </ul>
          {meta}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <VisibilityPill state={visibilityState(status.tone)} className="text-sm">
              {status.label}
            </VisibilityPill>
            {badges}
          </div>
        </div>
      </div>
      <div className="border-t border-ink-200 pt-4 sm:min-w-44 sm:border-t-0 sm:pt-0 sm:text-right">
        {score !== null ? (
          <>
            <p className="text-sm text-ink-700">Findtern Score</p>
            <p className="nums font-display text-4xl font-bold leading-none text-ink-900">
              {score.toFixed(1)}
              <span className="ml-1 text-base font-medium text-ink-600">/ 10</span>
            </p>
            <p className="mt-1.5 text-sm text-ink-700">
              {planNameFor(score)} · {bandFor(score).name}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-700">Findtern Score</p>
            <p className="font-display text-2xl font-semibold text-ink-900">Not scored yet</p>
            <p className="mt-1 max-w-56 text-pretty text-sm text-ink-700 sm:ml-auto">It appears here once your AI interview is scored.</p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The completeness meter: one segment per step, so the bar reads as the CV being filled in. It names the next
 * step and carries the page's one filled button. The step list opens under it.
 */
export function CompletenessPanel({ completion, started = true }: { completion: Completion; started?: boolean }) {
  const pct = completionPct(completion);
  const next = nextAction(completion);
  const items = completion.items;
  return (
    <div className="min-w-0 border-t border-ink-300 pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink-900">Profile completeness</h2>
        <p className="nums font-display text-4xl font-bold leading-none text-ink-900">
          {pct}
          <span className="text-lg font-semibold text-ink-700">%</span>
          <span className="sr-only"> complete</span>
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Profile completeness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-4 flex gap-1"
      >
        {items.length > 0 ? (
          items.map((i) => (
            <span key={i.id} aria-hidden className={cn("h-2 flex-1 rounded-md", i.done ? "bg-brand-800" : "bg-ink-200")} />
          ))
        ) : (
          <span aria-hidden className="h-2 flex-1 rounded-md bg-ink-200" />
        )}
      </div>
      <p className="nums mt-1.5 text-sm text-ink-700">
        {completion.done} of {completion.total} steps done
      </p>
      {next ? (
        <div className="mt-4">
          <p className="text-base font-semibold text-ink-900">Next: {next.label}</p>
          <p className="mt-0.5 text-pretty text-sm text-ink-700">{next.why}</p>
          {!started ? (
            <p className="mt-2 text-pretty text-sm text-ink-700">
              Employers search the profile you fill in: skills, studies, experience and where you can work.
            </p>
          ) : null}
          <ButtonLink href={next.href} className="mt-4 w-full touch:min-h-11">
            {started ? "Continue" : "Start your profile"}
            <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      ) : (
        <p className="mt-4 flex items-start gap-2 text-sm text-ink-800">
          <Check className="mt-0.5 size-4 shrink-0 text-brand-700" strokeWidth={3} aria-hidden />
          Everything employers need is filled in. Keep it current as you learn and build.
        </p>
      )}
      {items.length > 0 ? (
        <ul className="mt-4 divide-y divide-ink-200 border-t border-ink-200">
          {items.map((item) => (
            <li key={item.id}>
              {item.done ? (
                <span className="flex min-h-10 items-center gap-3 py-1.5 text-sm text-ink-700">
                  <Check className="size-4 shrink-0 text-brand-700" strokeWidth={3} aria-hidden />
                  {item.label}
                  <span className="sr-only"> (done)</span>
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="group/step flex min-h-11 items-center gap-3 py-1.5 text-sm font-medium text-ink-900 hover:text-brand-700"
                >
                  <span aria-hidden className="size-4 shrink-0 rounded-full border-2 border-ink-400" />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-xs text-ink-600">To do</span>
                  <ArrowRight className="size-4 text-ink-500 group-hover/step:text-brand-700" aria-hidden />
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** "On this page": plain anchors from the sections list, under the meter when the screen is tall enough. */
export function SectionNav({ sections, className }: { sections: { id: string; label: string }[]; className?: string }) {
  return (
    <nav aria-label="On this page" className={className}>
      <ul className="border-t border-ink-200">
        {sections.map((s) => (
          <li key={s.id} className="border-b border-ink-200">
            <a
              href={`#${s.id}`}
              className="block px-1 py-1.5 text-sm text-ink-700 transition-colors duration-150 hover:text-brand-700"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
