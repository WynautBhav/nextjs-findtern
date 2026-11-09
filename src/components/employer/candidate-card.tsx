"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, MapPin, Send, Sparkles, Star } from "lucide-react";

import { formatMoney } from "@/lib/format";
import { HOURS_PER_MONTH } from "@/lib/plan-offer";
import { displayNameOf, type CandidateProfile } from "@/lib/employer-candidates";
import { resolvePricing, type Currency, type Pricing } from "@/lib/employer-pricing";
import { candidateStatusPill, proposalActionLabel, type CandidateProposal } from "@/components/employer/candidate-status";
import { RowAvatar, ScoreBadge, SkillChips, headlineOf } from "@/components/employer/candidate-row-parts";
import { skillLead, studyOf } from "@/components/employer/candidate-view";
import { Pill } from "@/components/app/primitives";
import { skillMatch } from "@/components/app/skill-match";
import { SendProposalHold } from "@/components/employer/send-proposal-hold";
import { sendProposalHold } from "@/lib/proposal-guard";
import type { PresenceLabel } from "@/lib/presence";
import { PRESENCE_ONLINE } from "@/lib/presence-logic";
import { csrfFetch } from "@/lib/client-fetch";
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
  /** Skills the list is filtered by: matching chips are filled and listed first. */
  wantedSkills?: string[];
  /** "Active now" / "Last seen 2h ago" / "Offline"; null when the candidate hides it. */
  presence?: PresenceLabel | null;
  /** The intern saved this employer's role for the selected project. */
  interested?: boolean;
  /** ISO time of a booked meeting that still holds the candidate: "Send proposal" waits for it. */
  pendingMeetingAt?: string | null;
}

/**
 * The heart = this project's shortlist (the existing cart API), as an icon
 * button at every width. Not `disabled` while saving: that drops keyboard
 * focus. An offer already out goes to it.
 */
export function SaveToggle({ internId, projectId, shortlisted, name }: { internId: string; projectId: string; shortlisted: boolean; name?: string }) {
  const router = useRouter();
  const [on, setOn] = useState(shortlisted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/employer/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: on ? "remove" : "add", projectId, internId, listType: "cart" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && typeof data.proposalId === "string") {
        router.push(`/employer/proposal/${encodeURIComponent(data.proposalId)}`);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Couldn't update your saved list. Try again.");
      setOn(!on);
      router.refresh();
    } catch (e) {
      setError(e instanceof TypeError || !(e instanceof Error) ? "Couldn't reach the server. Check your connection and try again." : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-disabled={busy || undefined}
        aria-pressed={on}
        // An icon alone, named for screen readers, its state in aria-pressed.
        aria-label={name ? `Shortlist ${name}` : "Shortlist"}
        title={on ? "On this project's shortlist. Press to remove." : "Add to this project's shortlist"}
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:size-10 sm:touch:size-11",
          on ? "text-brand-700 hover:bg-brand-50" : "text-text-subtle hover:bg-ink-100 hover:text-ink-900",
        )}
      >
        {busy ? (
          <Loader2 className="size-[18px] animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Star className={cn("size-5", on && "fill-brand-700 text-brand-700")} aria-hidden />
        )}
      </button>
      {error ? (
        <span role="alert" className="absolute right-4 top-full z-20 mt-1 max-w-64 rounded-md bg-white px-2 py-1 text-xs text-danger shadow-md ring-1 ring-danger/30">
          {error}
        </span>
      ) : null}
    </>
  );
}

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
  const cls =
    "relative z-10 inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:h-10 sm:touch:h-11";
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
 * headline (the schema has none, so the top skills lead).
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
}: CandidateCardProps) {
  const pricing = resolved ?? resolvePricing(candidate.score, [], currency, region);
  const displayName = displayNameOf(candidate, nameUnlocked);
  const status = candidateStatusPill(proposal);
  const wantedSet = new Set(wantedSkills.map((w) => w.trim().toLowerCase()));
  // Lead with the top skills (the schema has no role or headline); the degree moves to the meta line.
  const { lead, rest } = skillLead(candidate.skills, wantedSet);
  const headline = lead || headlineOf(candidate);
  const study = lead ? studyOf(candidate.academics) : "";
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
    <SendProposalHold pendingMeetingAt={pendingMeetingAt} className="relative z-10" />
  ) : (
    <ButtonLink href={sendHref} variant="primary" size="sm" className="relative z-10 h-11 rounded-xl px-4 sm:h-10 sm:touch:h-11">
      <Send className="size-4" aria-hidden />
      Send proposal
    </ButtonLink>
  );

  const wanted = skillMatch(candidate.skills, wantedSkills);
  const cellLabel = "text-[11px] font-semibold uppercase tracking-wider text-text-subtle";

  return (
    <li className="group/row relative flex flex-col gap-4 rounded-2xl border border-ink-200 bg-white p-4 shadow-xs transition-colors hover:border-ink-300 sm:gap-5 sm:p-6">
      {/* Who: tile, name and stage, where, and the two quiet controls. */}
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
              <MapPin className="size-3.5 shrink-0 text-ink-400" aria-hidden />
              {study ? <span className="max-sm:hidden">{study} ·</span> : null}
              <span>{place}</span>
              {/* The dot alone is colour only; say it in words (a coarse label, nothing when the candidate hides it). */}
              {presence ? <span className={cn("whitespace-nowrap", presence === PRESENCE_ONLINE && "font-medium text-success")}>, {presence}</span> : null}
            </p>
          </div>
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-1 sm:gap-2">
          {canSave && projectId ? <SaveToggle internId={candidate.id} projectId={projectId} shortlisted={shortlisted} name={displayName} /> : null}
          <CompareToggle href={compareHref} selected={selected} name={displayName} />
        </div>
      </div>

      {/* What they are: the top skills lead (no role field), then how many you asked for. */}
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

      <SkillChips skills={candidate.skills} wanted={wantedSkills} skip={lead ? candidate.skills.length - rest.length : 0} />

      {/* One quiet action and the one primary action. The profile link is stretched over the whole card. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-ink-100 pt-4">
        {interview > 0 ? (
          <p className="nums flex items-center gap-1.5 text-[13px] text-text-subtle max-sm:hidden">
            <Sparkles className="size-4 text-brand-600" aria-hidden />
            AI interview {interview.toFixed(1)} / 10
          </p>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
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
          {primary}
        </div>
      </div>
    </li>
  );
}
