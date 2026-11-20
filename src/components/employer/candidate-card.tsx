"use client";

import { useState } from "react";
import Link from "next/link";
import { useProgressRouter } from "@/components/layout/navigation-progress";
import { Check, Clock, MapPin, Send, Sparkles, Star } from "lucide-react";

import { formatMoney } from "@/lib/format";
import { HOURS_PER_MONTH } from "@/lib/plan-offer";
import { displayNameOf, type CandidateProfile } from "@/lib/employer-candidates";
import { resolvePricing, type Currency, type Pricing } from "@/lib/employer-pricing";
import { PER_HIRE_FEE_DEFAULT } from "@/lib/per-hire-fee";
import { candidateStatusPill, proposalActionLabel, type CandidateProposal, type ExpiredProposal } from "@/components/employer/candidate-status";
import { RowAvatar, ScoreBadge, SkillChips, headlineOf } from "@/components/employer/candidate-row-parts";
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
import { ButtonLink, buttonClass } from "@/components/ui/button";
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
  /** Newest expired offer while nothing live shows: an "Expired" pill and a link to it; Send proposal stays. */
  expired?: ExpiredProposal | null;
  /** Skills the list is filtered by: matching chips are filled and listed first. */
  wantedSkills?: string[];
  /** "Active now" / "Last seen 2h ago" / "Offline"; null when the candidate hides it. */
  presence?: PresenceLabel | null;
  /** The intern saved this employer's role for the selected project. */
  interested?: boolean;
  /** ISO time of a booked meeting that still holds the candidate: "Send proposal" waits for it. */
  pendingMeetingAt?: string | null;
  /** "list" (default): the full-width card. "grid": the compact one, two across, three on wide screens. "rows": one dense line, same actions. */
  layout?: ListView;
}

/**
 * The star = this project's shortlist (the existing cart API): an icon and a
 * visible "Shortlist" / "Shortlisted" label (only the label hides, below 380px). Not `disabled` while saving: that drops keyboard
 * focus. An offer already out goes to it.
 */
export function SaveToggle({ internId, projectId, shortlisted, name }: { internId: string; projectId: string; shortlisted: boolean; name?: string }) {
  const router = useProgressRouter();
  // Flips the instant it is pressed; back to the true state if the server says no.
  const { value: on, pending: busy, toggle: flip } = useOptimisticToggle(shortlisted);
  const [error, setError] = useState<string | null>(null);
  const label = on ? "Shortlisted" : "Shortlist";

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
        // Starts with the visible word (WCAG 2.5.3); the state is also in aria-pressed.
        aria-label={name ? `${label}: ${name}` : label}
        title={on ? "On this project's shortlist. Press to remove." : "Add to this project's shortlist"}
        className={cn(
          "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:min-h-10 sm:min-w-10 sm:touch:min-h-11 sm:touch:min-w-11",
          on ? "text-brand-700 hover:bg-brand-50" : "text-text-subtle hover:bg-ink-100 hover:text-ink-900",
        )}
      >
        <Star className={cn("size-5 shrink-0", on && "fill-brand-700 text-brand-700")} aria-hidden />
        <span className="max-[380px]:sr-only">{label}</span>
      </button>
      {error ? (
        <span role="alert" className="absolute right-4 top-full z-20 mt-1 max-w-64 rounded-md bg-white px-2 py-1 text-xs text-danger shadow-md ring-1 ring-danger/30">
          {error}
        </span>
      ) : null}
    </>
  );
}

/** Compare and Quick view are the card's two quiet controls: one look, so they read as a pair. */
const SECONDARY_PILL =
  "relative z-10 inline-flex h-11 items-center justify-center rounded-xl border px-3 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:h-10 sm:touch:h-11";
const QUICK_VIEW_PILL = "gap-2 border border-ink-200 bg-ink-50 text-[13px] font-semibold text-ink-800 hover:bg-ink-100 hover:text-ink-900";

/** A checkbox-style link: the compare picks live in the URL, so it navigates. */
function CompareToggle({ href, selected, name }: { href: string | null; selected: boolean; name: string }) {
  const box = (
    <span
      aria-hidden
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors",
        selected ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 bg-white",
      )}
    >
      {selected ? <Check className="size-3" strokeWidth={3} /> : null}
    </span>
  );
  const cls = cn(SECONDARY_PILL, "shrink-0 gap-2");
  if (!href) {
    return (
      <span aria-disabled="true" title="Compare holds four. Remove one to add another." className={cn(cls, "cursor-not-allowed border-ink-200 bg-ink-50 text-ink-500")}>
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
      className={cn(cls, selected ? "border-ink-300 bg-ink-100 text-ink-900" : "border-ink-200 bg-ink-50 text-ink-800 hover:bg-ink-100")}
    >
      {box}
      Compare
    </Link>
  );
}

/**
 * One candidate as a card: the tile and who they are, Save and Compare, then a
 * three-cell strip (score, rate, availability), the skills, and one secondary
 * and one primary action. Only fields the pool really has: no bio, no role
 * headline (the schema has none, so the degree leads).
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
  expired = null,
  wantedSkills = [],
  presence = null,
  interested = false,
  pendingMeetingAt = null,
  layout = "list",
}: CandidateCardProps) {
  const pricing = resolved ?? resolvePricing(candidate.score, [], currency, region, PER_HIRE_FEE_DEFAULT);
  const displayName = displayNameOf(candidate, nameUnlocked);
  const status = candidateStatusPill(proposal, expired);
  // The headline is the degree and field (else the top two skills). The skills are listed once, in full, in the
  // "Skills" block below: they used to lead the headline and then drop out of the chips, so only four showed.
  const headline = headlineOf(candidate);
  const profileHref = `/employer/intern/${encodeURIComponent(candidate.id)}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`;
  const sendHref = `/employer/send-proposal?intern=${encodeURIComponent(candidate.id)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`;
  const place = candidate.city || candidate.location || "City not stated";
  const modes = candidate.workModes.join(" / ");
  const monthly = pricing.hourlyRateMinor > 0 ? formatMoney(pricing.hourlyRateMinor * HOURS_PER_MONTH, currency) : "";
  const interview = candidate.ratings.interview;
  const canSave = !proposal && Boolean(projectId);

  // One filled button per card: "Send proposal", or the link to the offer already out.
  const primary = proposal ? (
    <ButtonLink href={`/employer/proposal/${encodeURIComponent(proposal.id)}`} variant="primary" size="sm" className="relative z-10 h-11 rounded-xl sm:h-10 sm:touch:h-11">
      {proposalActionLabel(proposal)}
    </ButtonLink>
  ) : sendProposalHold(pendingMeetingAt) ? (
    <SendProposalHold
      pendingMeetingAt={pendingMeetingAt}
      className="relative z-10 max-w-60 text-right max-sm:max-w-none max-sm:flex-1 max-sm:items-stretch"
      controlClassName="justify-center rounded-xl border border-ink-200 sm:h-10 sm:touch:h-11"
    />
  ) : (
    <ButtonLink href={sendHref} variant="primary" size="sm" className="relative z-10 h-11 rounded-xl px-4 sm:h-10 sm:touch:h-11">
      <Send className="size-4" aria-hidden />
      Send proposal
    </ButtonLink>
  );

  // Opens the profile; its ::after stretches over the whole card, so the other controls sit above it (z-10).
  const viewProfile = (
    <Link
      href={profileHref}
      aria-label={`View profile of ${displayName}`}
      className={buttonClass({
        variant: "outline",
        size: "sm",
        className:
          "h-11 rounded-xl sm:h-10 sm:touch:h-11 after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500",
      })}
    >
      View profile
    </Link>
  );
  const wanted = skillMatch(candidate.skills, wantedSkills);
  const cellLabel = "text-[11px] font-semibold uppercase tracking-wider text-text-subtle";
  const quickView = (
    <CandidateQuickView
      candidate={candidate}
      displayName={displayName}
      place={place}
      currency={currency}
      pricing={pricing}
      wantedSkills={wantedSkills}
      profileHref={profileHref}
      className={QUICK_VIEW_PILL}
    />
  );

  if (layout === "rows") {
    // The compact line pair: who and the two numbers, then the skills and the same actions as the cards.
    return (
      <li className="group/row relative flex min-w-0 flex-col gap-3 rounded-2xl border border-ink-200 bg-white p-3 shadow-xs transition-colors hover:border-ink-300 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
            <RowAvatar square photoUrl={candidate.photoUrl} initials={candidate.initials} seed={candidate.id} presence={presence} className="size-11 sm:size-11" />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="break-words text-base font-bold leading-6 text-ink-900">{displayName}</h3>
                {status ? <Pill tone={status.tone} className="shrink-0 whitespace-nowrap">{status.label}</Pill> : null}
                {interested ? (
                  <Pill tone="live" className="shrink-0 whitespace-nowrap">
                    Interested in this role
                  </Pill>
                ) : null}
              </div>
              <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-sm text-ink-600">
                <MapPin className="size-3.5 shrink-0 text-ink-500" aria-hidden />
                <span className="min-w-0 truncate">{place}</span>
                {headline ? <span className="max-sm:hidden">· {headline}</span> : null}
                {presence === PRESENCE_ONLINE ? <span className="whitespace-nowrap font-medium text-success">, {presence}</span> : null}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-5 sm:gap-8">
            <div className="flex flex-col gap-1">
              <span className={cellLabel}>Findtern Score</span>
              <ScoreBadge size="cell" score={candidate.score} scored={candidate.scored} />
            </div>
            <div className="flex flex-col gap-1">
              <span className={cn(cellLabel, "whitespace-nowrap")}>Hourly rate</span>
              <p className="nums flex items-baseline gap-1 text-lg font-bold leading-7 text-ink-900">
                {formatMoney(pricing.hourlyRateMinor, currency)}
                <span className="text-xs font-normal text-text-subtle">/ hr</span>
              </p>
            </div>
          </div>
          {canSave && projectId ? (
            <div className="relative z-10 shrink-0 max-sm:absolute max-sm:right-2 max-sm:top-2">
              <SaveToggle internId={candidate.id} projectId={projectId} shortlisted={shortlisted} name={displayName} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-ink-100 pt-3">
          <div className="min-w-0 flex-1 basis-64 space-y-1.5">
            <SkillChips skills={candidate.skills} wanted={wantedSkills} />
            {wanted.total > 0 ? (
              <p className="text-xs text-ink-600">
                <span className="nums font-medium text-ink-900">{wanted.matched.length} of {wanted.total}</span> skills you asked for
              </p>
            ) : null}
          </div>
          <div className="relative z-10 flex flex-wrap items-center gap-2 max-sm:w-full [&>*]:max-sm:flex-1">
            <CompareToggle href={compareHref} selected={selected} name={displayName} />
            {quickView}
            {viewProfile}
            {primary}
          </div>
        </div>
      </li>
    );
  }

  if (layout === "grid") {
    // The compact card, divided: header (who), body (the numbers and skills), footer (the actions).
    // Its own edge, shadow, hover and focus ring: on the white page a hairline alone made neighbours run together.
    return (
      <li
        data-selected={selected || undefined}
        data-shortlisted={shortlisted || undefined}
        className={cn(
          "group/row relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-[border-color,box-shadow] duration-150",
          "hover:shadow-md focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/25",
          selected ? "border-brand-600 ring-2 ring-brand-600/30" : "border-ink-300 hover:border-ink-400",
        )}
      >
        <div className={cn("flex items-start justify-between gap-2 border-b px-4 py-3.5", shortlisted ? "border-brand-200 bg-brand-50" : "border-ink-300 bg-ink-100")}>
          <div className="flex min-w-0 items-center gap-3">
            <RowAvatar square photoUrl={candidate.photoUrl} initials={candidate.initials} seed={candidate.id} presence={presence} />
            <div className="min-w-0">
              <h3 className="break-words text-base font-bold leading-6 text-ink-900">{displayName}</h3>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-600">
                <MapPin className="size-3.5 shrink-0 text-ink-500" aria-hidden />
                <span className="min-w-0 truncate">{place}</span>
              </p>
            </div>
          </div>
          {canSave && projectId ? (
            <div className="relative z-10 shrink-0">
              <SaveToggle internId={candidate.id} projectId={projectId} shortlisted={shortlisted} name={displayName} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-3 px-4 py-4">
          {status || interested || selected ? (
            <div className="flex flex-wrap gap-1.5">
              {selected ? <Pill tone="new" className="shrink-0 whitespace-nowrap">In compare</Pill> : null}
              {status ? <Pill tone={status.tone} className="shrink-0 whitespace-nowrap">{status.label}</Pill> : null}
              {interested ? (
                <Pill tone="live" className="shrink-0 whitespace-nowrap">
                  Interested in this role
                </Pill>
              ) : null}
            </div>
          ) : null}

          {headline ? <p className="line-clamp-2 text-pretty text-sm font-semibold leading-snug text-ink-900">{headline}</p> : null}
          {wanted.total > 0 ? (
            <p className="-mt-1.5 text-xs text-ink-600">
              <span className="nums font-medium text-ink-900">{wanted.matched.length} of {wanted.total}</span> skills you asked for
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 rounded-xl border border-ink-200 bg-ink-50 p-3">
            <div className="flex flex-col gap-1">
              <span className={cellLabel}>Findtern Score</span>
              <ScoreBadge size="cell" score={candidate.score} scored={candidate.scored} />
            </div>
            <div className="flex flex-col gap-1 border-l border-ink-200 pl-3">
              <span className={cn(cellLabel, "whitespace-nowrap")}>Hourly rate</span>
              <p className="nums flex items-baseline gap-1 text-lg font-bold leading-7 text-ink-900">
                {formatMoney(pricing.hourlyRateMinor, currency)}
                <span className="text-xs font-normal text-text-subtle">/ hr</span>
              </p>
            </div>
          </div>

          <SkillChips heading skills={candidate.skills} wanted={wantedSkills} />
        </div>

        <div className="mt-auto flex flex-col gap-2 border-t border-ink-300 bg-ink-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 [&>*]:flex-1">
            <CompareToggle href={compareHref} selected={selected} name={displayName} />
            {quickView}
          </div>
          <div className="flex flex-wrap items-center gap-2 [&>*]:flex-1">
            {viewProfile}
            {primary}
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="group/row relative flex flex-col gap-4 rounded-2xl border border-ink-200 bg-white p-4 shadow-xs transition-colors hover:border-ink-300 sm:gap-5 sm:p-6">
      {/* Who: tile, name and stage, where, and the shortlist star. */}
      <div className="flex items-start justify-between gap-2 sm:gap-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <RowAvatar square photoUrl={candidate.photoUrl} initials={candidate.initials} seed={candidate.id} presence={presence} />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              <h3 className="text-lg font-bold leading-6 text-ink-900">{displayName}</h3>
              {status ? <Pill tone={status.tone} className="shrink-0 whitespace-nowrap">{status.label}</Pill> : null}
              {interested ? (
                <Pill tone="live" className="shrink-0 whitespace-nowrap">
                  Interested in this role
                </Pill>
              ) : null}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-ink-600">
              <MapPin className="size-3.5 shrink-0 text-ink-500" aria-hidden />
              <span>{place}</span>
              {/* The dot alone is colour only; say it in words (a coarse label, nothing when the candidate hides it). */}
              {presence ? <span className={cn("whitespace-nowrap", presence === PRESENCE_ONLINE && "font-medium text-success")}>, {presence}</span> : null}
            </p>
          </div>
        </div>
        {canSave && projectId ? (
          <div className="relative z-10 shrink-0">
            <SaveToggle internId={candidate.id} projectId={projectId} shortlisted={shortlisted} name={displayName} />
          </div>
        ) : null}
      </div>

      {/* What they are: degree and field, then how many skills you asked for. */}
      {headline || wanted.total > 0 ? (
        <div>
          {headline ? <p className="line-clamp-2 text-pretty text-lg font-semibold leading-snug text-ink-900">{headline}</p> : null}
          {wanted.total > 0 ? (
            <p className="mt-1 text-sm text-ink-600">
              <span className="nums font-medium text-ink-900">{wanted.matched.length} of {wanted.total}</span> skills you asked for
            </p>
          ) : null}
        </div>
      ) : null}

      {/* The numbers. The monthly line is the hourly rate x the 176 billed hours of a Mon-Fri month, nothing more. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-xl border border-ink-200 bg-ink-50 p-3 sm:grid-cols-3 sm:gap-4 sm:p-4">
        <div className="flex flex-col gap-1">
          <span className={cellLabel}>Findtern Score</span>
          <ScoreBadge size="cell" score={candidate.score} scored={candidate.scored} />
          {interview > 0 ? (
            <p className="nums flex items-center gap-1 text-[11px] leading-4 text-text-subtle">
              <Sparkles className="size-3 text-brand-600" aria-hidden />
              AI interview {interview.toFixed(1)} / 10
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1 border-l border-ink-200 pl-3 sm:pl-5">
          <span className={cn(cellLabel, "whitespace-nowrap")}>Hourly rate</span>
          <p className="nums flex items-baseline gap-1 text-[20px] font-bold leading-7 text-ink-900">
            {formatMoney(pricing.hourlyRateMinor, currency)}
            <span className="text-xs font-normal text-text-subtle">/ hr</span>
          </p>
          {monthly ? (
            <p className="nums text-[11px] leading-4 text-text-subtle" title={`${formatMoney(pricing.hourlyRateMinor, currency)} x ${HOURS_PER_MONTH} hours a month (Mon-Fri)`}>
              <span aria-hidden>≈ {monthly}/mo</span>
              <span className="sr-only">About {monthly} a month at {HOURS_PER_MONTH} hours</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1 max-sm:col-span-2 max-sm:border-t max-sm:border-ink-200 max-sm:pt-3 sm:border-l sm:border-ink-200 sm:pl-5">
          <span className={cellLabel}>Availability</span>
          <p className="flex items-start gap-1.5 text-sm font-semibold leading-5 text-ink-900">
            <Clock className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            <span>{modes || "Not stated"}</span>
          </p>
          {candidate.hasLaptop ? <p className="text-[11px] leading-4 text-text-subtle">Has own laptop</p> : null}
        </div>
      </div>

      <SkillChips heading skills={candidate.skills} wanted={wantedSkills} />

      {/* The pair of quiet controls on the left, the profile and the one primary action on the right. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-3 border-t border-ink-100 pt-4">
        <div className="flex flex-wrap items-start gap-2 max-sm:w-full [&>*]:max-sm:flex-1">
          <CompareToggle href={compareHref} selected={selected} name={displayName} />
          {quickView}
        </div>
        <div className="flex flex-wrap items-start gap-2 max-sm:w-full sm:justify-end [&>*]:max-sm:flex-1">
          {viewProfile}
          {primary}
        </div>
      </div>
    </li>
  );
}
