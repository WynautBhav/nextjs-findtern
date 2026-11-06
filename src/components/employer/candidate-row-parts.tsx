"use client";

import { Check, Info } from "lucide-react";

import { PLAN_NAME, bandFor } from "@/lib/score";
import type { PresenceLabel } from "@/lib/presence";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { rowSkills } from "@/components/employer/candidate-view";

export { headlineOf } from "@/components/employer/candidate-view";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The pieces every employer candidate row shares (Candidates, Shortlist), so a
 * saved candidate looks the same wherever it shows. Initials only before hire;
 * photo yes; never the bio, contact details or the intern's pay.
 */

/** Photo (or brand-tinted initials) with the presence dot on its edge. */
export function RowAvatar({
  photoUrl,
  initials,
  presence = null,
  className,
}: {
  photoUrl?: string | null;
  initials: string;
  presence?: PresenceLabel | null;
  className?: string;
}) {
  const online = presence === "Online now";
  return (
    <div className="relative shrink-0 self-start">
      <CandidateAvatar
        photoUrl={photoUrl}
        initials={initials}
        className={cn("size-12 rounded-full bg-brand-100/70 text-sm ring-1 ring-inset ring-brand-200/70 sm:size-14 sm:text-base", className)}
      />
      {presence ? (
        <span
          aria-hidden
          title={presence}
          className={cn(
            "absolute bottom-0 right-0 size-3.5 rounded-full ring-[2.5px] ring-white",
            online ? "bg-success" : "bg-ink-300",
          )}
        />
      ) : null}
    </div>
  );
}

/**
 * "9.0 Findtern Score · Latte (i)": the plan name is explained in a tooltip
 * (hover, focus or long-press), never a bare word.
 */
export function ScoreBadge({ score, scored }: { score: number; scored: boolean }) {
  if (!scored) return <span className="text-sm text-ink-600">Not scored yet</span>;
  const band = bandFor(score);
  const plan = PLAN_NAME[band.id];
  const range = band.max >= 10 ? `${band.min} or above` : `${band.min} to under ${band.max}`;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="nums text-base font-semibold text-ink-900">{score.toFixed(1)}</span>
      <span className="text-ink-600">Findtern Score</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="relative z-10 -my-1 inline-flex min-h-7 items-center gap-1 rounded-full px-1.5 font-medium text-ink-800 outline-none hover:bg-ink-100 focus-visible:ring-2 focus-visible:ring-brand-500 touch:min-h-11"
          >
            {plan}
            <Info className="size-3.5 text-ink-400" aria-hidden />
            <span className="sr-only">: what this means</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {plan} is the price band for a Findtern Score of {range}. {band.blurb}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

/**
 * Skills that match the search first, as filled chips with a check; the rest
 * as quiet outlines. At most seven, then "+N". Levels stay private.
 */
export function SkillChips({ skills, wanted, className }: { skills: string[]; wanted: string[]; className?: string }) {
  const { shown, more, isWanted } = rowSkills(skills, new Set(wanted.map((w) => w.trim().toLowerCase())));
  if (shown.length === 0) return <p className={cn("text-sm text-ink-600", className)}>No skills listed yet.</p>;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Skills">
      {shown.map((skill) => {
        const hit = isWanted(skill);
        return (
          <li
            key={skill}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium",
              hit ? "bg-brand-100 text-brand-900" : "text-ink-700 ring-1 ring-inset ring-ink-200",
            )}
          >
            {hit ? <Check className="size-3.5 text-brand-700" strokeWidth={2.5} aria-hidden /> : null}
            {skill}
            {hit ? <span className="sr-only"> (matches your search)</span> : null}
          </li>
        );
      })}
      {more > 0 ? (
        <li className="inline-flex h-7 items-center rounded-full px-2 text-[13px] font-medium text-ink-600">
          +{more}
          <span className="sr-only"> more skills</span>
        </li>
      ) : null}
    </ul>
  );
}
