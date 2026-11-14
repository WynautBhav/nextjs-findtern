import Link from "next/link";
import { ArrowRight, Check, ChevronDown, GraduationCap, MapPin } from "lucide-react";

import { ScoreDial } from "@/components/app/score-dial";
import type { Tone } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { VisibilityPill } from "@/components/intern/visibility-pill";
import { visibilityState } from "@/components/intern/visibility-state";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { bandFor, planNameFor } from "@/lib/score";
import { cn } from "@/lib/utils";
import { completionPct, nextAction, type Completion } from "./profile-logic";

export type ProfileStatus = { tone: Tone; label: string; detail: string };

/** Ratings arrive as [label, value] pairs; the dial knows four axes by key. */
const AXIS_BY_LABEL: Record<string, "coding" | "aptitude" | "interview" | "communication"> = {
  Coding: "coding",
  Aptitude: "aptitude",
  "AI interview": "interview",
  Communication: "communication",
};

function axesOf(ratings: [string, number][]) {
  const axes: Partial<Record<"coding" | "aptitude" | "interview" | "communication", number>> = {};
  for (const [label, value] of ratings) {
    const key = AXIS_BY_LABEL[label];
    if (key) axes[key] = value;
  }
  return axes;
}

/**
 * The page's identity block, sticky beside the sections on a wide screen and the first card on a phone.
 * It is the candidate's own view, so it carries the full name; the employer-facing row is further down.
 *
 * Seams for later work: `badges` sits beside the status pill (the visibility pill goes there) and `meta`
 * sits under the college line (college-account fields go there). Both default to nothing.
 */
export function ProfileSummary({
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
  ratings,
  completion,
  started = true,
}: {
  name: string;
  initials: string;
  photoUrl: string | null;
  /** "B.Tech, Computer Science". */
  degree: string;
  institution: string;
  place: string;
  status: ProfileStatus;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  score: number | null;
  ratings: [string, number][];
  completion: Completion;
  /** False when nothing is saved yet: the button then says where to start. */
  started?: boolean;
}) {
  const pct = completionPct(completion);
  const next = nextAction(completion);
  const todo = completion.items.filter((i) => !i.done);
  const done = completion.items.filter((i) => i.done);
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xs">
      {/* A flat band of the brand mint: the avatar sits on its edge, which is what makes this read as a person, not a form. */}
      <div aria-hidden className="h-16 border-b border-brand-200 bg-brand-100 sm:h-20 xl:h-12" />
      <div className="grid gap-x-8 gap-y-5 px-5 pb-5 sm:px-6 sm:pb-6 md:grid-cols-2 xl:grid-cols-1 xl:gap-x-0">
        {/* ── Who ─────────────────────────────────────────────── */}
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <CandidateAvatar
            photoUrl={photoUrl}
            initials={initials}
            className="-mt-9 size-[4.5rem] rounded-2xl text-2xl ring-4 ring-white sm:-mt-11 sm:size-20 sm:text-3xl xl:-mt-8 xl:size-16 xl:text-2xl"
          />
          <p className="mt-3 text-balance break-words text-xl font-semibold leading-tight tracking-[-0.02em] text-ink-900">{name}</p>
          {degree ? <p className="mt-1 text-pretty text-sm font-medium text-ink-800">{degree}</p> : null}
          <ul className="mt-4 space-y-1.5 text-sm text-ink-700">
            {institution ? (
              <li className="flex items-start gap-2">
                <GraduationCap className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">{institution}</span>
              </li>
            ) : null}
            {place ? (
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">{place}</span>
              </li>
            ) : null}
            {!institution && !place ? <li className="text-ink-600">Add your college and city so employers can place you.</li> : null}
          </ul>
          {meta}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <VisibilityPill state={visibilityState(status.tone)} className="text-sm">
              {status.label}
            </VisibilityPill>
            {badges}
          </div>
        </div>

        {/* ── Findtern Score ───────────────────────────────────── */}
        <div className="min-w-0 border-t border-ink-100 pt-5 max-md:order-3">
          <h2 className="text-sm font-semibold text-ink-900">Findtern Score</h2>
          {score !== null ? (
            <div className="mt-3 flex items-center gap-4">
              <ScoreDial score={score} axes={axesOf(ratings)} size="md" />
              <div className="min-w-0">
                <p className="text-base font-semibold text-ink-900">
                  {planNameFor(score)} <span className="font-normal text-ink-600">· {bandFor(score).name}</span>
                </p>
                <p className="mt-1 text-pretty text-sm text-ink-600">{bandFor(score).blurb}</p>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-4">
              <span
                aria-hidden
                className="grid size-[6.5rem] shrink-0 place-items-center rounded-full border-[8px] border-ink-100 text-2xl font-light text-ink-500"
              >
                –
              </span>
              <div className="min-w-0">
                <p className="text-base font-semibold text-ink-900">Not scored yet</p>
                <p className="mt-1 text-pretty text-sm text-ink-600">Your score appears here once your AI interview is scored.</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Progress and the next step ───────────────────────── */}
        <div className="min-w-0 border-t border-ink-100 pt-5 max-md:order-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink-900">Profile completeness</h2>
            <p className="nums text-sm font-semibold text-ink-900">
              {pct}%<span className="sr-only"> complete</span>
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Profile completeness"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mt-2.5 h-2 overflow-hidden rounded-full bg-ink-100"
          >
            <div className={cn("h-full rounded-full bg-brand-600", pct > 0 && pct < 100 && "min-w-2")} style={{ width: `${pct}%` }} />
          </div>
          {next ? (
            <div className="mt-3">
              <p className="text-sm font-semibold text-ink-900">Next: {next.label}</p>
              <p className="mt-0.5 text-pretty text-sm text-ink-600">{next.why}</p>
              {!started ? (
                <p className="mt-2 text-pretty text-sm text-ink-600">
                  Employers search the profile you fill in: skills, studies, experience and where you can work.
                </p>
              ) : null}
              <ButtonLink href={next.href} size="sm" className="mt-3 w-full sm:w-auto xl:w-full">
                {started ? "Continue" : "Start your profile"}
              </ButtonLink>
            </div>
          ) : (
            <p className="mt-4 flex items-start gap-2 text-sm text-ink-700">
              <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
              Everything employers need is filled in. Keep it current as you learn and build.
            </p>
          )}
          {completion.total > 0 && (todo.length > 1 || done.length > 0) ? (
            <details className="group mt-1">
              <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-ink-700 hover:text-ink-900 touch:min-h-11 [&::-webkit-details-marker]:hidden">
                All {completion.total} steps
                <ChevronDown
                  className="size-4 transition-transform duration-150 ease-out group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <ul className="divide-y divide-ink-100">
                {completion.items.map((item) => (
                  <li key={item.id}>
                    {item.done ? (
                      <span className="flex min-h-10 items-center gap-3 py-1.5 text-sm text-ink-600">
                        <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                        {item.label}
                        <span className="sr-only"> (done)</span>
                      </span>
                    ) : (
                      <Link
                        href={item.href}
                        className="group/step flex min-h-11 items-center gap-3 py-1.5 text-sm font-medium text-ink-900 hover:text-brand-700"
                      >
                        <span aria-hidden className="size-5 shrink-0 rounded-full border-2 border-ink-300" />
                        <span className="flex-1">{item.label}</span>
                        <ArrowRight className="size-4 text-ink-500 group-hover/step:text-brand-700" aria-hidden />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** "On this page": plain anchors from the sections list, shown beside the sticky card when the screen is tall enough. */
export function SectionNav({ sections, className }: { sections: { id: string; label: string }[]; className?: string }) {
  return (
    <nav aria-label="On this page" className={className}>
      <ul className="space-y-0.5">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block rounded-lg px-3 py-1.5 text-sm text-ink-600 transition-[background-color,color] duration-150 hover:bg-white hover:text-ink-900"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
