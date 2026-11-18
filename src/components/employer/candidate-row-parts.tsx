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

/** Photo (or flat initials disc) with a green dot on its edge when online now. */
export function RowAvatar({
  photoUrl,
  initials,
  presence = null,
  className,
  square = false,
}: {
  photoUrl?: string | null;
  initials: string;
  presence?: PresenceLabel | null;
  className?: string;
  /** Kept for callers that pass it: initials are always a flat disc now, never a tinted tile. */
  seed?: string;
  /** A softly squared photo instead of a disc. */
  square?: boolean;
}) {
  const online = presence === PRESENCE_ONLINE;
  return (
    <div className="relative shrink-0 self-start">
      <CandidateAvatar
        photoUrl={photoUrl}
        initials={initials}
        className={cn("size-10 bg-ink-100 text-sm text-ink-800 sm:size-11", square ? "rounded-lg" : "rounded-full", className)}
      />
      {/* Green only: a grey dot reads as "offline"; older activity is spelled out on the meta line. */}
      {online ? <span aria-hidden className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-success ring-2 ring-paper" /> : null}
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
            hero ? "-ml-1.5 -my-0.5 px-1.5 text-base" : cell ? "-ml-1.5 px-1.5 text-sm" : "-my-1 px-1.5",
          )}
        >
          {plan}
          {/* One word of meaning beside the coffee name, so the tier is never a bare label. The numeral column is narrow: there it lives in the tooltip. */}
          {cell ? null : <span className="font-normal text-ink-600">· {band.name}</span>}
          <Info className="size-3.5 text-ink-500" aria-hidden />
          <span className="sr-only">: what this means</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {plan} is the price band for a Findtern Score of {range}. {band.blurb}
      </TooltipContent>
    </Tooltip>
  );
  if (cell) {
    // The ranking figure: the score as an oversized numeral, the price band under it.
    return (
      <span className="flex flex-col items-start gap-1">
        <span className="nums font-display text-2xl font-semibold leading-none text-brand-800 sm:text-4xl">
          {score.toFixed(1)}
          <span className="sr-only"> out of 10</span>
        </span>
        {tier}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center text-sm", hero ? "gap-3" : "gap-1.5")}>
      <span className={cn("nums font-semibold", hero ? "text-2xl leading-none text-brand-700" : "text-base text-ink-900")}>{score.toFixed(1)}</span>
      <span className={cn("inline-flex", hero ? "flex-col-reverse items-start" : "items-center gap-1.5")}>
        <span className={cn(hero ? "text-xs text-ink-600" : "text-ink-600")}>Findtern Score</span>
        {tier}
      </span>
    </span>
  );
}

/**
 * Every skill the candidate has: the ones the project asked for first, as filled
 * chips with a check; the rest as quiet text with no box, so the match is what
 * the eye finds. Interns hold at most seven, so all of them show. A legacy list
 * longer than seven folds behind "+N more", which opens the rest. `heading`
 * puts a "Skills (N)" label above. Levels stay private.
 */
export function SkillChips({
  skills,
  wanted,
  className,
  skip = 0,
  heading = false,
}: {
  skills: string[];
  wanted: string[];
  className?: string;
  skip?: number;
  heading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { shown, more, isWanted } = rowSkills(skills, new Set(wanted.map((w) => w.trim().toLowerCase())), open ? skills.length : undefined, skip);
  if (skip > 0 && shown.length === 0 && more === 0) return null;
  if (shown.length === 0) return <p className={cn("text-sm text-ink-600", className)}>No skills listed yet.</p>;
  const chips = (
    <ul className={cn("flex flex-wrap items-center gap-x-1 gap-y-1", !heading && className)} aria-label="Skills">
      {shown.map((skill) => {
        const hit = isWanted(skill);
        return (
          <li
            key={skill}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md text-sm",
              hit ? "bg-brand-100 px-2 font-medium text-brand-900" : "px-1.5 text-ink-700",
            )}
          >
            {hit ? <Check className="size-3.5 text-brand-700" strokeWidth={2.5} aria-hidden /> : null}
            {skill}
            {hit ? <span className="sr-only"> (matches your project)</span> : null}
          </li>
        );
      })}
      {more > 0 ? (
        <li>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative z-10 inline-flex h-7 items-center rounded-md px-2 text-sm font-medium text-ink-700 underline underline-offset-4 outline-none hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            +{more} more
            <span className="sr-only"> skills: show them</span>
          </button>
        </li>
      ) : null}
    </ul>
  );
  if (!heading) return chips;
  return (
    <div className={className}>
      <p className="mb-1.5 text-xs font-medium text-ink-600">
        Skills <span className="nums">({skills.length})</span>
      </p>
      {chips}
    </div>
  );
}

/**
 * How much of the project's skill list a candidate covers, drawn as one tick
 * per skill (filled = has it) and said in words beside it. The ticks are the
 * data, not decoration: five asked for, four had.
 */
export function FitTicks({ matched, total, className }: { matched: number; total: number; className?: string }) {
  if (total <= 0) return null;
  return (
    <p className={cn("flex items-center gap-2 text-sm text-ink-700", className)}>
      <span aria-hidden className="flex items-center gap-0.5">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-2 w-4 rounded-sm", i < matched ? "bg-brand-700" : "bg-ink-200")} />
        ))}
      </span>
      <span className="nums">
        <span className="font-medium text-ink-900">{matched} of {total}</span> project skills
      </span>
    </p>
  );
}
