"use client";

import { useState } from "react";
import { Check, Info } from "lucide-react";

import { bandFor, planNameFor } from "@/lib/score";
import type { PresenceLabel } from "@/lib/presence";
import { PRESENCE_ONLINE } from "@/lib/presence-logic";
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
  seed,
  square = false,
}: {
  photoUrl?: string | null;
  initials: string;
  presence?: PresenceLabel | null;
  className?: string;
  seed?: string;
  /** The Candidates card's rounded-square tile; other lists keep the circle. */
  square?: boolean;
}) {
  const online = presence === PRESENCE_ONLINE;
  return (
    <div className="relative shrink-0 self-start sm:row-span-2">
      <CandidateAvatar
        photoUrl={photoUrl}
        initials={initials}
        seed={seed}
        className={cn("size-12 text-sm ring-1 ring-inset ring-black/5 sm:size-14 sm:text-base", square ? "rounded-2xl" : "rounded-full", className)}
      />
      {/* Green only: a grey dot reads as "offline"; older activity is spelled out on the meta line. */}
      {online ? <span aria-hidden className="absolute bottom-0 right-0 size-3.5 rounded-full bg-success ring-[2.5px] ring-white" /> : null}
    </div>
  );
}

/**
 * The score as the hero of a row: "9.1" large in brand-700, the band name
 * (Espresso, Cappuccino, Latte) and "Findtern Score" beside it. The band name
 * is explained in a tooltip, never a bare word. Hover, focus and a tap open it
 * (Radix alone closes it again on the tap's click, so on a phone it never
 * showed). `size="inline"` keeps the small one-line form for dense lists.
 */
export function ScoreBadge({ score, scored, size = "inline" }: { score: number; scored: boolean; size?: "hero" | "inline" | "cell" }) {
  const [open, setOpen] = useState(false);
  if (!scored) return <span className="text-sm text-ink-600">Not scored yet</span>;
  const band = bandFor(score);
  const plan = planNameFor(score);
  const range = band.max >= 10 ? `${band.min} or above` : `${band.min} to under ${band.max}`;
  const hero = size === "hero";
  const cell = size === "cell";
  const tier = (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        asChild
        // A tap focuses (which opens it) and then clicks, which Radix treats as "close": keep it open.
        // On the Trigger, not the button: only here does preventDefault skip that close. Tap outside, Escape or blur close it.
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <button
          type="button"
          className={cn(
            "relative z-10 inline-flex min-h-7 items-center gap-1 rounded-full font-medium text-ink-800 outline-none hover:bg-ink-100 focus-visible:ring-2 focus-visible:ring-brand-500 touch:min-h-11",
            hero ? "-ml-1.5 -my-0.5 px-1.5 text-[15px]" : cell ? "-ml-1.5 px-1.5 text-[13px]" : "-my-1 px-1.5",
          )}
        >
          {plan}
          {/* One word of meaning beside the coffee name, so the tier is never a bare label. */}
          <span className="font-normal text-ink-600">· {band.name}</span>
          <Info className="size-3.5 text-ink-400" aria-hidden />
          <span className="sr-only">: what this means</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {plan} is the price band for a Findtern Score of {range}. {band.blurb}
      </TooltipContent>
    </Tooltip>
  );
  if (cell) {
    // A metric-strip cell: the number with "/ 10", the tier under it.
    return (
      <span className="flex flex-col items-start gap-0.5">
        <span className="flex items-baseline gap-1">
          <span className="nums text-[26px] font-semibold leading-none text-brand-700">{score.toFixed(1)}</span>
          <span className="text-xs text-text-subtle">/ 10</span>
        </span>
        {tier}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center text-sm", hero ? "gap-3" : "gap-1.5")}>
      <span className={cn("nums font-semibold", hero ? "text-[28px] leading-none text-brand-700" : "text-base text-ink-900")}>{score.toFixed(1)}</span>
      <span className={cn("inline-flex", hero ? "flex-col-reverse items-start" : "items-center gap-1.5")}>
        <span className={cn(hero ? "text-xs text-ink-600" : "text-ink-600")}>Findtern Score</span>
        {tier}
      </span>
    </span>
  );
}

/**
 * Skills that match the search first, as filled chips with a check; the rest
 * as quiet outlines. At most seven, then "+N". Levels stay private.
 */
export function SkillChips({ skills, wanted, className, skip = 0 }: { skills: string[]; wanted: string[]; className?: string; skip?: number }) {
  const { shown, more, isWanted } = rowSkills(skills, new Set(wanted.map((w) => w.trim().toLowerCase())), undefined, skip);
  if (skip > 0 && shown.length === 0 && more === 0) return null;
  if (shown.length === 0) return <p className={cn("text-sm text-ink-600", className)}>No skills listed yet.</p>;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Skills">
      {shown.map((skill) => {
        const hit = isWanted(skill);
        return (
          <li
            key={skill}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium",
              hit ? "bg-brand-100 text-brand-900" : "bg-ink-50 text-ink-700 ring-1 ring-inset ring-ink-200",
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
