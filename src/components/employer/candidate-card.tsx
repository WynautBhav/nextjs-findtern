"use client";

import { useState } from "react";
import Link from "next/link";
import { useProgressRouter } from "@/components/layout/navigation-progress";
import { Check, MapPin, Star } from "lucide-react";

import { formatMoney } from "@/lib/format";
import { HOURS_PER_MONTH } from "@/lib/plan-offer";
import { displayNameOf, type CandidateProfile } from "@/lib/employer-candidates";
import { resolvePricing, type Currency, type Pricing } from "@/lib/employer-pricing";
import { PER_HIRE_FEE_DEFAULT } from "@/lib/per-hire-fee";
import { candidateStatusPill, proposalActionLabel, type CandidateProposal } from "@/components/employer/candidate-status";
import { FitTicks, RowAvatar, ScoreBadge, SkillChips, headlineOf } from "@/components/employer/candidate-row-parts";
import { type ListView } from "@/components/employer/candidate-view";
import { CandidateQuickView } from "@/components/employer/candidate-quick-view";
import { Pill } from "@/components/app/primitives";
import { skillMatch } from "@/components/app/skill-match";
import { SendProposalHold } from "@/components/employer/send-proposal-hold";
import { sendProposalHold } from "@/lib/proposal-guard";
import type { PresenceLabel } from "@/lib/presence";
import { PRESENCE_ONLINE } from "@/lib/presence-logic";
import { csrfFetch } from "@/lib/client-fetch";
import { useOptimisticToggle } from "@/hooks/use-optimistic-toggle";
import { saveFailureMessage } from "@/lib/fetch-error";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CandidateCardProps {
  candidate: CandidateProfile;
  currency: Currency;
  region: "IN" | null;
  selected: boolean;
  /** Toggles the compare pick; null when four are already picked (EMB-13). */
  compareHref: string | null;
  projectId: string | null;
  shortlisted: boolean;
  /** True when this employer hired the candidate - the only case the full name shows. */
  nameUnlocked?: boolean;
  /** Resolved server-side against the CMS rate card; falls back to the bands. */
  pricing?: Pricing;
  /** This employer's live or hired offer to the candidate, if any. */
  proposal?: CandidateProposal | null;
  /** Skills the list is filtered by: matching chips are filled and listed first. */
  wantedSkills?: string[];
  /** "Active now" / "Last seen 2h ago" / "Offline"; null when the candidate hides it. */
  presence?: PresenceLabel | null;
  /** The intern saved this employer's role for the selected project. */
  interested?: boolean;
  /** ISO time of a booked meeting that still holds the candidate: "Send proposal" waits for it. */
  pendingMeetingAt?: string | null;
  /** "list" (default): the full ruled row. "grid": the same row, two across. "rows": one dense line. Same actions in all three. */
  layout?: ListView;
}

/**
 * The star = this project's shortlist (the existing cart API). Icon only by
 * default (compare columns); `labelled` adds the word "Shortlist" beside it
 * (the candidate rows). Not `disabled` while saving: that drops keyboard
 * focus. An offer already out goes to it.
 */
export function SaveToggle({
  internId,
  projectId,
  shortlisted,
  name,
  labelled = false,
}: {
  internId: string;
  projectId: string;
  shortlisted: boolean;
  name?: string;
  labelled?: boolean;
}) {
  const router = useProgressRouter();
  // Flips the instant it is pressed; back to the true state if the server says no.
  const { value: on, pending: busy, toggle: flip } = useOptimisticToggle(shortlisted);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    flip(async (next) => {
      try {
        const res = await csrfFetch("/api/employer/cart", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: next ? "add" : "remove", projectId, internId, listType: "cart" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && typeof data.proposalId === "string") {
          router.push(`/employer/proposal/${encodeURIComponent(data.proposalId)}`);
          return false;
        }
        if (!res.ok) throw new Error(data.error ?? "Couldn't update your saved list. Try again.");
        router.refresh();
        return true;
      } catch (e) {
        setError(saveFailureMessage(e));
        return false;
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        aria-pressed={on}
        // The state is in aria-pressed; the name starts with the visible word.
        aria-label={name ? `Shortlist ${name}` : "Shortlist"}
        title={on ? "On this project's shortlist. Press to remove." : "Add to this project's shortlist"}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
          labelled ? "px-2.5" : "size-11 shrink-0 sm:size-10 sm:touch:size-11",
          on ? "text-brand-800 hover:bg-brand-50" : "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
        )}
      >
        <Star className={cn("size-[18px]", on && "fill-brand-700 text-brand-700")} aria-hidden />
        {labelled ? <span>Shortlist</span> : null}
      </button>
      {error ? (
        <span role="alert" className="absolute right-2 top-full z-20 mt-1 max-w-64 rounded-md bg-surface-raised px-2 py-1 text-xs text-danger shadow-md ring-1 ring-danger/30">
          {error}
        </span>
      ) : null}
    </>
  );
}

/** The row's quiet controls share one look, so Shortlist, Compare and Quick view read as a set. */
const QUIET =
  "relative z-10 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-700 outline-none transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/** A checkbox-style link: the compare picks live in the URL, so it navigates. */
function CompareToggle({ href, selected, name }: { href: string | null; selected: boolean; name: string }) {
  const box = (
    <span
      aria-hidden
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-sm border transition-colors",
        selected ? "border-ink-900 bg-ink-900 text-white" : "border-ink-400 bg-surface-raised",
      )}
    >
      {selected ? <Check className="size-3" strokeWidth={3} /> : null}
    </span>
  );
  if (!href) {
    return (
      <span aria-disabled="true" title="Compare holds four. Remove one to add another." className={cn(QUIET, "cursor-not-allowed text-ink-600 hover:bg-transparent hover:text-ink-600")}>
        {box}
        Compare
        <span className="sr-only"> (four already picked)</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      // Starts with the visible word (WCAG 2.5.3); the state is in the name, as a link has no aria-checked.
      aria-label={selected ? `Compare ${name}: selected, press to remove` : `Compare ${name}`}
      className={cn(QUIET, selected && "bg-ink-100 text-ink-900")}
    >
      {box}
      Compare
    </Link>
  );
}

/** The two numbers an employer prices a hire by: the hourly rate, then how and where they work. */
function Facts({
  hourly,
  monthly,
  modes,
  hasLaptop,
  interview,
  currency,
  className,
}: {
  hourly: number;
  monthly: string;
  modes: string;
  hasLaptop: boolean | null;
  interview: number;
  currency: Currency;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="nums flex items-baseline gap-1 font-display text-lg font-semibold leading-6 text-ink-900">
        {formatMoney(hourly, currency)}
        <span className="font-sans text-xs font-normal text-ink-600">/ hr</span>
      </p>
      {monthly ? (
        <p className="nums text-xs text-ink-600" title={`${formatMoney(hourly, currency)} x ${HOURS_PER_MONTH} hours a month (Mon-Fri)`}>
          <span aria-hidden>≈ {monthly}/mo</span>
          <span className="sr-only">About {monthly} a month at {HOURS_PER_MONTH} hours</span>
        </p>
      ) : null}
      <p className="mt-2 text-sm text-ink-900">{modes || "Work mode not stated"}</p>
      {hasLaptop ? <p className="text-sm text-ink-700">Own laptop</p> : null}
      {interview > 0 ? <p className="nums text-xs text-ink-600">AI interview {interview.toFixed(1)} / 10</p> : null}
    </div>
  );
}

/**
 * One candidate as a row of the ranked ledger: the Findtern Score as an
 * oversized numeral, who they are and how many of the project's skills they
 * have (ticks + the matched skills filled), the hourly rate, then four quiet
 * controls. Only fields the pool really has: no bio, no role headline (the
 * schema has none, so the degree leads). Initials and photo only before hire.
 */
export function CandidateCard({
  candidate,
  currency,
  region,
  selected,
  compareHref,
  projectId,
  shortlisted,
  nameUnlocked = false,
  pricing: resolved,
  proposal = null,
  wantedSkills = [],
  presence = null,
  interested = false,
  pendingMeetingAt = null,
  layout = "list",
}: CandidateCardProps) {
  const pricing = resolved ?? resolvePricing(candidate.score, [], currency, region, PER_HIRE_FEE_DEFAULT);
  const displayName = displayNameOf(candidate, nameUnlocked);
  const status = candidateStatusPill(proposal);
  const headline = headlineOf(candidate);
  const profileHref = `/employer/intern/${encodeURIComponent(candidate.id)}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`;
  const sendHref = `/employer/send-proposal?intern=${encodeURIComponent(candidate.id)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`;
  const place = candidate.city || candidate.location || "City not stated";
  const modes = candidate.workModes.join(" / ");
  const monthly = pricing.hourlyRateMinor > 0 ? formatMoney(pricing.hourlyRateMinor * HOURS_PER_MONTH, currency) : "";
  const interview = candidate.ratings.interview;
  const canSave = !proposal && Boolean(projectId);
  const wanted = skillMatch(candidate.skills, wantedSkills);
  const dense = layout === "rows";
  const wide = layout === "list";

  // The one proposal action per row, outline: a page of identical filled buttons would shout.
  const primary = proposal ? (
    <ButtonLink href={`/employer/proposal/${encodeURIComponent(proposal.id)}`} variant="outline" size="sm" className="relative z-10 min-h-11 max-sm:w-full">
      {proposalActionLabel(proposal)}
    </ButtonLink>
  ) : sendProposalHold(pendingMeetingAt) ? (
    <SendProposalHold
      pendingMeetingAt={pendingMeetingAt}
      className="relative z-10 max-w-60 text-right max-sm:max-w-none max-sm:w-full max-sm:items-stretch"
      controlClassName="justify-center rounded-md border border-ink-200 min-h-11"
    />
  ) : (
    <ButtonLink href={sendHref} variant="outline" size="sm" className="relative z-10 min-h-11 px-4 max-sm:w-full">
      Send proposal
    </ButtonLink>
  );

  const quickView = (
    <CandidateQuickView
      candidate={candidate}
      displayName={displayName}
      place={place}
      currency={currency}
      pricing={pricing}
      wantedSkills={wantedSkills}
      profileHref={profileHref}
      className={QUIET}
    />
  );

  const name = (
    <h3 className="min-w-0 break-words font-display text-lg font-semibold leading-6 text-ink-900">
      <Link
        href={profileHref}
        aria-label={`View profile of ${displayName}`}
        // The link's ::after stretches over the whole row, so a click anywhere opens the profile; the controls sit above it (z-10).
        className="rounded-sm outline-none after:absolute after:inset-0 after:content-[''] hover:underline hover:underline-offset-4 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
      >
        {displayName}
      </Link>
    </h3>
  );
  const pills = (
    <>
      {status ? <Pill tone={status.tone} className="shrink-0 whitespace-nowrap">{status.label}</Pill> : null}
      {interested ? (
        <Pill tone="live" className="shrink-0 whitespace-nowrap">
          Interested in this role
        </Pill>
      ) : null}
    </>
  );
  const where = (
    <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-sm text-ink-700">
      <MapPin className="size-3.5 shrink-0 text-ink-500" aria-hidden />
      <span className="min-w-0">{place}</span>
      {/* The dot alone is colour only; say it in words (a coarse label, nothing when the candidate hides it). */}
      {presence ? <span className={cn("whitespace-nowrap", presence === PRESENCE_ONLINE ? "font-medium text-success" : "text-ink-600")}>, {presence}</span> : null}
    </p>
  );
  const tick = <FitTicks matched={wanted.matched.length} total={wanted.total} />;

  if (dense) {
    // One line per candidate: the numeral, who, the fit, the rate, and the same controls.
    return (
      <li className="group/row relative grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-b border-ink-200 py-3 md:grid-cols-[3.5rem_minmax(0,1.3fr)_minmax(0,1fr)_7.5rem_auto]">
        <div>
          {candidate.scored ? (
            <span className="nums font-display text-2xl font-semibold leading-none text-brand-800">
              {candidate.score.toFixed(1)}
              <span className="sr-only"> out of 10</span>
            </span>
          ) : (
            <ScoreBadge score={candidate.score} scored={candidate.scored} />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {name}
            {pills}
          </div>
          <p className="truncate text-sm text-ink-700">
            {[headline, place].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="col-start-2 md:col-start-auto">{wanted.total > 0 ? tick : <p className="text-sm text-ink-600">{candidate.skills.length} skills listed</p>}</div>
        <p className="nums col-start-2 text-sm text-ink-900 md:col-start-auto">
          <span className="font-display text-base font-semibold">{formatMoney(pricing.hourlyRateMinor, currency)}</span>
          <span className="text-xs text-ink-600"> / hr</span>
        </p>
        <div className="col-start-2 flex flex-wrap items-center gap-x-1 md:col-start-auto md:justify-end">
          {canSave && projectId ? (
            <div className="relative z-10">
              <SaveToggle internId={candidate.id} projectId={projectId} shortlisted={shortlisted} name={displayName} labelled />
            </div>
          ) : null}
          <CompareToggle href={compareHref} selected={selected} name={displayName} />
          <span className="max-md:hidden">{quickView}</span>
          {primary}
        </div>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group/row relative border-b border-ink-200 py-5 sm:py-6",
        // The two-across layout hangs a hairline between the columns instead of boxing each row.
        !wide && "min-w-0",
      )}
    >
      <div className={cn("grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[5.25rem_minmax(0,1fr)] sm:gap-x-5", wide && "md:grid-cols-[5.25rem_minmax(0,1fr)_12.5rem]")}>
        <div className="pt-0.5">
          <ScoreBadge size="cell" score={candidate.score} scored={candidate.scored} />
        </div>

        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <RowAvatar photoUrl={candidate.photoUrl} initials={candidate.initials} presence={presence} className="size-8 text-xs sm:size-8" />
            {name}
            {pills}
          </div>
          {headline ? <p className="mt-1.5 line-clamp-2 text-pretty text-base font-medium leading-snug text-ink-900">{headline}</p> : null}
          {where}
          {wanted.total > 0 ? <div className="mt-3">{tick}</div> : null}
          <SkillChips className="mt-2" skills={candidate.skills} wanted={wantedSkills} />
          <Facts
            className={cn("mt-3 border-t border-ink-100 pt-3", wide && "md:hidden")}
            hourly={pricing.hourlyRateMinor}
            monthly={monthly}
            modes={modes}
            hasLaptop={candidate.hasLaptop}
            interview={interview}
            currency={currency}
          />
        </div>

        {wide ? (
          <Facts
            className="max-md:hidden md:border-l md:border-ink-200 md:pl-5"
            hourly={pricing.hourlyRateMinor}
            monthly={monthly}
            modes={modes}
            hasLaptop={candidate.hasLaptop}
            interview={interview}
            currency={currency}
          />
        ) : null}

        {/* Three quiet controls, then the one proposal action at the far end. On a phone the action leads. */}
        <div className={cn("col-span-full mt-4 flex flex-wrap items-center gap-x-1 gap-y-2 max-sm:flex-col-reverse max-sm:items-stretch", wide && "md:col-start-2 md:col-span-2")}>
          <div className="flex flex-wrap items-center gap-x-1 max-sm:justify-between">
            {canSave && projectId ? (
              <div className="relative z-10">
                <SaveToggle internId={candidate.id} projectId={projectId} shortlisted={shortlisted} name={displayName} labelled />
              </div>
            ) : null}
            <CompareToggle href={compareHref} selected={selected} name={displayName} />
            {quickView}
          </div>
          <div className="sm:ml-auto">{primary}</div>
        </div>
      </div>
    </li>
  );
}
