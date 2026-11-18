import Link from "next/link";
import { Check, Scale } from "lucide-react";

import { PLAN_NAME, bandFor } from "@/lib/score";
import { formatRate } from "@/lib/format";
import { RATING_META, displayNameOf, type CandidateProfile } from "@/lib/employer-candidates";
import type { Currency, Pricing } from "@/lib/employer-pricing";
import { Avatar } from "@/components/app/avatar";
import { ScoreDial } from "@/components/app/score-dial";
import { skillMatch } from "@/components/app/match-line";
import { Pill } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { candidateStatusPill, proposalActionLabel, type CandidateProposal } from "@/components/employer/candidate-status";
import { cn } from "@/lib/utils";

const INITIAL: Record<string, string> = { communication: "C", coding: "D", aptitude: "A", interview: "I" };

/**
 * One candidate as a floating "leaderboard" tile: rank, score ring, identity,
 * skills with the wanted ones ticked, the four interview axes as an equaliser,
 * and the rate as a figure. A spine on the left fills to the score.
 * The whole tile opens the profile (stretched link); actions sit above it.
 */
export function CandidateRow({
  candidate: c,
  index,
  rank,
  nameUnlocked,
  proposal,
  hired,
  pricing,
  currency,
  projectId,
  shortlisted,
  selected,
  compareHref,
  wantedSkills,
}: {
  candidate: CandidateProfile;
  index: number;
  /** 1-based position in the whole ranked list, not just this page. */
  rank: number;
  nameUnlocked: boolean;
  proposal: CandidateProposal | null;
  hired: boolean;
  pricing: Pricing;
  currency: Currency;
  projectId: string | null;
  shortlisted: boolean;
  selected: boolean;
  compareHref: string | null;
  wantedSkills: string[];
}) {
  const status = candidateStatusPill(proposal);
  const name = displayNameOf(c, nameUnlocked);
  const meta = [c.city, c.workModes.join(" / "), c.hasLaptop === false ? "Needs a laptop" : ""].filter(Boolean).join(" · ");
  const band = PLAN_NAME[bandFor(c.score).id];
  const skills = c.skills.map((k) => k.split(" · ")[0].trim());
  const match = skillMatch(skills, wantedSkills);
  const wanted = new Set(match.matched.map((s) => s.toLowerCase()));
  const sorted = [...skills].sort((a, b) => Number(wanted.has(b.toLowerCase())) - Number(wanted.has(a.toLowerCase())));
  const shown = sorted.slice(0, 4);
  const axes = {
    communication: c.ratings.communication > 0 ? c.ratings.communication : null,
    coding: c.ratings.coding > 0 ? c.ratings.coding : null,
    aptitude: c.ratings.aptitude > 0 ? c.ratings.aptitude : null,
    interview: c.ratings.interview > 0 ? c.ratings.interview : null,
  };
  const podium = rank <= 3;
  return (
    <li
      style={{ ["--i" as string]: Math.min(index, 12) }}
      className="rise tile-lift group relative overflow-hidden rounded-[22px] bg-white py-4 pl-6 pr-4 transition-[background-color] hover:bg-[linear-gradient(95deg,var(--color-brand-50),#fff_45%)] focus-within:ring-2 focus-within:ring-brand-600/30 sm:pr-6"
    >
      {/* Spine: fills from the bottom to the score. */}
      <span aria-hidden className="absolute inset-y-3 left-2 w-1 overflow-hidden rounded-full bg-ink-100">
        <span
          className="absolute inset-x-0 bottom-0 rounded-full bg-[linear-gradient(to_top,var(--color-brand-700),var(--color-brand-400))] transition-[height] duration-300"
          style={{ height: c.scored ? `${Math.min(100, c.score * 10)}%` : "0%" }}
        />
      </span>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span
          aria-hidden
          className={cn(
            "nums grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold max-lg:hidden",
            podium ? "bg-brand-800 text-white shadow-[0_6px_14px_-6px_rgb(7_47_36/0.6)]" : "bg-ink-100 text-ink-600",
          )}
        >
          {rank}
        </span>
        <span className="sr-only">Rank {rank}.</span>

        <Avatar src={c.photoUrl} initials={c.initials} masked={!nameUnlocked} name={nameUnlocked ? name : undefined} size="md" />

        <div className="min-w-[12rem] flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/employer/intern/${c.id}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`}
              className="break-words text-lg font-medium leading-tight tracking-[-0.015em] text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-brand-800 focus-visible:after:rounded-[22px] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
            >
              {name}
            </Link>
            {status ? <Pill tone={status.tone} className="shrink-0 whitespace-nowrap">{status.label}</Pill> : null}
          </div>
          <p className="mt-0.5 text-sm text-text-subtle">{meta || "Location not stated"}</p>
        </div>

        {c.scored ? (
          <ScoreDial score={c.score} axes={axes} size="sm" showBand={false} />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-full border border-dashed border-ink-200 text-center text-[11px] leading-tight text-text-subtle">Not scored</span>
        )}

        <div className="min-w-[6.5rem] text-right max-sm:text-left">
          <p className="nums text-[1.65rem] font-light leading-none tracking-[-0.04em] text-ink-900">
            {formatRate(pricing.hourlyRateMinor, currency).replace(/\s*\/\s*hr$/i, "")}
            {pricing.hourlyRateMinor > 0 ? <span className="ml-0.5 text-xs font-normal tracking-normal text-text-subtle">/hr</span> : null}
          </p>
          <p className="mt-1 text-xs font-medium text-text-subtle">{band}</p>
        </div>

        <div className="relative z-10 flex items-center justify-end gap-2 max-sm:w-full max-sm:justify-start">
          {proposal ? (
            <ButtonLink
              href={`/employer/proposal/${encodeURIComponent(proposal.id)}`}
              variant="primary"
              size="sm"
              // Starts with the visible word so voice control can say it (WCAG 2.5.3).
              aria-label={`${proposal.status === "hired" ? "Placement" : "Proposal"}: ${proposalActionLabel(proposal)}`}
              className="rounded-full"
            >
              {proposal.status === "hired" ? "Placement" : "Proposal"}
            </ButtonLink>
          ) : projectId ? (
            <ShortlistToggle internId={c.id} projectId={projectId} shortlisted={shortlisted} size="sm" emphasis="primary" />
          ) : null}
          {hired ? null : compareHref ? (
            <Link
              href={compareHref}
              scroll={false}
              aria-label={selected ? `In compare: remove ${name}` : `Compare ${name}`}
              className={buttonClass({ variant: "outline", size: "sm", className: cn("min-h-11 rounded-full", selected && "bg-brand-50 text-brand-800") })}
            >
              <Scale className="size-4" aria-hidden />
              <span className="lg:sr-only">{selected ? "In compare" : "Compare"}</span>
            </Link>
          ) : null}
        </div>
      </div>

      {/* Second line: skills the role asked for come first and are ticked; the interview axes as an equaliser. */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 lg:pl-[calc(2.25rem+1rem)]">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {match.total > 0 ? (
            <span className="mr-1 inline-flex items-center gap-2 whitespace-nowrap text-xs text-text-subtle">
              <span aria-hidden className="flex gap-0.5">
                {Array.from({ length: match.total }, (_, i) => (
                  <span key={i} className={cn("h-1.5 w-3 rounded-full", i < match.matched.length ? "bg-brand-600" : "bg-ink-200")} />
                ))}
              </span>
              <span className="nums"><span className="font-semibold text-ink-900">{match.matched.length}</span>/{match.total}</span> match
            </span>
          ) : null}
          {shown.map((s) => {
            const on = wanted.has(s.toLowerCase());
            return (
              <span
                key={s}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  on ? "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200/80" : "bg-ink-100 text-ink-700",
                )}
              >
                {on ? <Check className="size-3" aria-hidden /> : null}
                {s}
                {on ? <span className="sr-only"> (matches)</span> : null}
              </span>
            );
          })}
          {sorted.length > shown.length ? <span className="nums text-xs text-text-subtle">+{sorted.length - shown.length}</span> : null}
        </div>

        {c.scored ? (
          <ul aria-label="Interview ratings" className="flex items-end gap-2.5">
            {RATING_META.map((m) => {
              const v = c.ratings[m.key];
              return (
                <li key={m.key} title={`${m.label} ${v > 0 ? v.toFixed(1) : "not rated"}`} className="flex flex-col items-center gap-1">
                  <span aria-hidden className="relative flex h-9 w-2.5 items-end overflow-hidden rounded-full bg-ink-100">
                    <span className="w-full rounded-full bg-[linear-gradient(to_top,var(--color-brand-700),var(--color-brand-400))] transition-[height] duration-300 group-hover:brightness-110" style={{ height: `${Math.min(100, v * 10)}%` }} />
                  </span>
                  <span aria-hidden className="text-[10px] font-medium leading-none text-text-subtle">{INITIAL[m.key]}</span>
                  <span className="sr-only">{m.label} {v > 0 ? v.toFixed(1) : "not rated"}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </li>
  );
}
