import Link from "next/link";
import { Check } from "lucide-react";

import type { PresenceLabel } from "@/lib/presence";
import { PRESENCE_ONLINE } from "@/lib/presence-logic";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { SaveToggle } from "@/components/employer/candidate-card";
import { skillBaseName } from "@/components/employer/candidate-view";
import { bandFor } from "@/lib/score";
import { cn } from "@/lib/utils";

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
 * One top match as a ruled row (an `<li>`: put it in a `<ul>`): the Findtern Score as the
 * figure on the left, then initials, place and how many of the project's skills they have, their
 * skills, and the shortlist star. The initials link stretches over the row; the star sits above it.
 */
export function MatchCard({ id, href, initials, photoUrl, presence, where, score, fit, chips, more, saved }: MatchCardProps) {
  const online = presence === PRESENCE_ONLINE;
  const band = score !== null ? bandFor(score).name : null;
  return (
    <li className="admin-arrive nth-2:[--i:1] nth-3:[--i:2] nth-4:[--i:3] group relative grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 border-b border-ink-200 py-4 transition-colors hover:bg-ink-100/60 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
      <div className="text-left">
        {score !== null ? (
          <p role="img" aria-label={`Findtern Score ${score.toFixed(1)} out of 10, ${band}`} className="nums font-display text-4xl font-semibold leading-none tracking-[-0.03em] text-ink-900">
            {score.toFixed(1)}
          </p>
        ) : (
          <p role="img" aria-label="Not scored yet" className="nums font-display text-4xl font-semibold leading-none text-ink-600">–</p>
        )}
        <p aria-hidden className="mt-1 text-xs text-ink-600">{band ?? "unscored"}</p>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <CandidateAvatar photoUrl={photoUrl} initials={initials} className="size-8 rounded-full bg-ink-800 text-xs text-white" />
          <p className="truncate text-base font-medium text-ink-900">
            <Link href={href} className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-700">
              {initials}
            </Link>
          </p>
          <p className="min-w-0 truncate text-sm text-ink-700">
            {where || "Location not stated"}
            {online ? <span className="ml-2 font-medium text-brand-700">Online now</span> : null}
          </p>
        </div>

        {fit?.of ? (
          <p className="mt-1.5 text-sm text-ink-700">
            <span className="nums font-semibold text-ink-900">{fit.hit} of {fit.of}</span> skills for <span className="break-words">{fit.projectName}</span>
          </p>
        ) : null}

        {chips.length ? (
          <ul className="mt-2 flex min-w-0 flex-wrap gap-1.5" aria-label="Skills">
            {chips.map((k) => (
              <li
                key={k.name}
                className={cn(
                  "inline-flex h-6 max-w-[9rem] items-center gap-1 rounded-md px-2 text-xs",
                  k.matched ? "bg-brand-100 font-medium text-brand-900" : "text-ink-700 ring-1 ring-inset ring-ink-300",
                )}
              >
                {k.matched ? <Check className="size-3 shrink-0" strokeWidth={2.5} aria-hidden /> : null}
                <span className="truncate">{skillBaseName(k.name)}</span>
                {k.matched ? <span className="sr-only"> (matches)</span> : null}
              </li>
            ))}
            {more ? (
              <li className="inline-flex h-6 items-center px-1 text-xs text-ink-700">
                +{more}
                <span className="sr-only"> more skills</span>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-600">No skills listed</p>
        )}
      </div>

      {fit ? (
        <span className="relative z-10 -mr-2 -mt-2">
          <SaveToggle internId={id} projectId={fit.projectId} shortlisted={saved} name={initials} />
        </span>
      ) : null}
    </li>
  );
}
