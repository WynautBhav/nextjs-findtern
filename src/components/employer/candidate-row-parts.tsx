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

/** Photo (or brand-tinted initials) with a green dot on its edge when online now. */
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
    <div className="relative shrink-0 self-start sm:row-span-2">
      <CandidateAvatar
        photoUrl={photoUrl}
        initials={initials}
        className={cn("size-12 rounded-full bg-brand-100/70 text-sm ring-1 ring-inset ring-brand-200/70 sm:size-14 sm:text-base", className)}
      />
      {/* Green only: a grey dot reads as "offline"; older activity is spelled out on the meta line. */}
      {online ? <span aria-hidden className="absolute bottom-0 right-0 size-3.5 rounded-full bg-success ring-[2.5px] ring-white" /> : null}
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
  // The one number employers filter on gets the row's one tinted anchor.
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand-50 pl-2.5 pr-0.5 text-sm ring-1 ring-inset ring-brand-100">
      <span className="nums font-semibold text-ink-900">{score.toFixed(1)}</span>
      <span className="text-ink-700">Findtern Score</span>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* 44px tall to the finger, 24px to the eye: the negative margin keeps the pill h-7. */}
          <button type="button" className="group/band relative z-10 -my-2 inline-flex h-11 min-w-11 items-center outline-none">
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-white px-2 text-[13px] font-medium text-brand-900 ring-1 ring-inset ring-brand-100 group-hover/band:bg-brand-100 group-focus-visible/band:ring-2 group-focus-visible/band:ring-brand-500">
              {plan}
              <Info className="size-3.5 text-brand-700/70" aria-hidden />
            </span>
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
