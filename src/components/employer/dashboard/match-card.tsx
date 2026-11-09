import Link from "next/link";
import { Check } from "lucide-react";

import type { PresenceLabel } from "@/lib/presence";
import { PRESENCE_ONLINE } from "@/lib/presence-logic";
import { SURFACE_CLASS } from "@/components/app/primitives";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { SaveToggle } from "@/components/employer/candidate-card";
import { skillBaseName } from "@/components/employer/candidate-view";
import { ScoreRing } from "@/components/employer/dashboard/score-ring";
import { cn } from "@/lib/utils";
import { fitSegments, tintFor } from "./card-geometry";

/** Initials and photo only: never a name, contact or the intern's pay before a hire. */
export type MatchCardProps = {
  id: string;
  /** Intern page, with `?project=` when a fit exists. */
  href: string;
  initials: string;
  photoUrl: string | null;
  presence: PresenceLabel | null;
  /** "Pune · Remote", or "" when unknown (print "Location not stated"). */
  where: string;
  /** Null when not scored yet. */
  score: number | null;
  /** Best open project for this candidate; null when the employer has no open project. */
  fit: { hit: number; of: number; projectId: string; projectName: string } | null;
  /** Up to 3 skills; `matched` means the project wants it. */
  chips: { name: string; matched: boolean }[];
  /** Skills beyond `chips`. */
  more: number;
  /** Already on the shortlist for `fit.projectId`. SaveToggle needs `fit`; render it only when `fit` is set. */
  saved: boolean;
};

/**
 * Skill fit as one segment per skill the project asked for, `hit` of them
 * filled. 16 x 4 each up to 8; past that they share a fixed 142px so a long
 * list still fits. Segments fill left to right once on first paint (transform
 * only, 40ms apart, off under reduced motion).
 */
function FitSegments({ hit, of }: { hit: number; of: number }) {
  const { n, filled, width } = fitSegments(hit, of);
  return (
    <span
      aria-hidden
      className="grid h-1"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, columnGap: 2, width }}
    >
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={cn(
            "origin-left rounded-full transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] starting:scale-x-0 motion-reduce:transition-none",
            i < filled ? "bg-brand-600" : "bg-ink-200",
          )}
          style={{ transitionDelay: `${Math.min(i, 8) * 40}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * One top match as a card (an `<li>`: put it in a `<ul>`): face, initials and
 * place, the Findtern Score as a ring, how many of the project's skills they
 * have, their skills and a shortlist star. The initials link stretches over the
 * whole card; the star sits above it.
 */
export function MatchCard({ id, href, initials, photoUrl, presence, where, score, fit, chips, more, saved }: MatchCardProps) {
  const online = presence === PRESENCE_ONLINE;
  return (
    <li
      className={cn(
        SURFACE_CLASS,
        "admin-arrive group relative flex min-h-[164px] min-w-0 flex-col gap-3 p-4 transition-colors hover:bg-brand-50/50 nth-2:[--i:1] nth-3:[--i:2] nth-4:[--i:3]",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <CandidateAvatar
            photoUrl={photoUrl}
            initials={initials}
            className={cn("size-14 rounded-full text-lg ring-1 ring-inset ring-black/5", tintFor(id))}
          />
          {/* Green only: an older "last seen" is spelled out on the line below, not drawn as a grey dot. */}
          {online ? <span aria-hidden className="absolute bottom-0 right-0 size-3.5 rounded-full bg-success ring-[2.5px] ring-white" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-6 text-ink-900">
            <Link
              href={href}
              className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
            >
              {initials}
            </Link>
          </p>
          <p className="truncate text-sm leading-5 text-text-subtle">{where || "Location not stated"}</p>
          {presence ? <p className={cn("truncate text-xs leading-4", online ? "font-medium text-success" : "text-text-subtle")}>{presence}</p> : null}
        </div>
        {score !== null ? (
          <ScoreRing score={score} />
        ) : (
          // Hatch = "not yet", as everywhere on the console.
          <span role="img" aria-label="Not scored yet" title="Not scored yet" className="relative grid size-14 shrink-0 place-items-center">
            <svg aria-hidden viewBox="0 0 56 56" className="absolute inset-0">
              <circle cx="28" cy="28" r="26" fill="none" strokeWidth="4" strokeDasharray="3 4" className="stroke-ink-300" />
            </svg>
            <span aria-hidden className="text-base font-semibold text-text-subtle">
              –
            </span>
          </span>
        )}
      </div>

      {fit?.of ? (
        <div title={`${fit.hit} of ${fit.of} skills for ${fit.projectName}`}>
          <FitSegments hit={fit.hit} of={fit.of} />
          <p className="mt-1.5 truncate text-sm leading-5 text-ink-600">
            <span className="nums font-semibold text-ink-900">
              {fit.hit} of {fit.of}
            </span>{" "}
            skills for {fit.projectName}
          </p>
        </div>
      ) : null}

      <div className="mt-auto flex items-end justify-between gap-2">
        {chips.length ? (
          <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label="Skills">
            {chips.map((k) =>
              k.matched ? (
                <li key={k.name} className="inline-flex h-6 max-w-[8rem] items-center gap-1 rounded-md bg-brand-50 px-2 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-100">
                  <Check className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />
                  <span className="truncate">{skillBaseName(k.name)}</span>
                  <span className="sr-only"> (matches)</span>
                </li>
              ) : (
                <li key={k.name} className="inline-flex h-6 max-w-[8rem] items-center rounded-md px-2 text-xs text-ink-600 ring-1 ring-inset ring-ink-200">
                  <span className="truncate">{skillBaseName(k.name)}</span>
                </li>
              ),
            )}
            {more ? (
              <li className="inline-flex h-6 items-center px-1 text-xs text-ink-600">
                +{more}
                <span className="sr-only"> more skills</span>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="text-sm text-text-subtle">No skills listed</p>
        )}
        {fit ? (
          <span className="relative z-10 -mb-2 -mr-2 shrink-0">
            <SaveToggle internId={id} projectId={fit.projectId} shortlisted={saved} name={initials} />
          </span>
        ) : null}
      </div>
    </li>
  );
}
