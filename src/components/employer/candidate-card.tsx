"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Heart, Loader2, MapPin, Send } from "lucide-react";

import { formatRate } from "@/lib/format";
import { displayNameOf, type CandidateProfile } from "@/lib/employer-candidates";
import { resolvePricing, type Currency, type Pricing } from "@/lib/employer-pricing";
import { FullTimeOfferButton } from "@/components/employer/full-time-offer-button";
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
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** What a hired candidate's card needs to offer a full-time role (EMH-42). */
export type FullTimeContext = { employerId: string; fteStatus: string; timezone: string };

export interface CandidateCardProps {
  candidate: CandidateProfile;
  currency: Currency;
  region: "IN" | null;
  selected: boolean;
  /** Toggles the compare pick; null when four are already picked (EMB-13). */
  compareHref: string | null;
  /** False once this employer has hired them: compare leaves hires out. */
  comparable?: boolean;
  projectId: string | null;
  shortlisted: boolean;
  /** True when this employer hired the candidate - the only case the full name shows. */
  nameUnlocked?: boolean;
  /** Hired (on any project): the row says so, even when the live offer shown is another one. */
  hired?: boolean;
  /** Resolved server-side against the CMS rate card; falls back to the bands. */
  pricing?: Pricing;
  /** This employer's live or hired offer to the candidate, if any. */
  proposal?: CandidateProposal | null;
  /** Internship hire a full-time offer can follow from (EMH-42), with context. */
  fullTimeFrom?: string | null;
  fullTime?: FullTimeContext | null;
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
        // Upwork's heart: an icon alone, named for screen readers, its state in aria-pressed.
        aria-label={name ? `Shortlist ${name}` : "Shortlist"}
        title={on ? "On this project's shortlist. Press to remove." : "Add to this project's shortlist"}
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:size-9 sm:touch:size-11",
          on ? "text-brand-700 ring-brand-200 hover:bg-brand-50" : "text-ink-600 ring-ink-200 hover:bg-ink-100 hover:text-ink-900",
        )}
      >
        {busy ? (
          <Loader2 className="size-[18px] animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Heart className={cn("size-[18px]", on && "fill-brand-700 text-brand-700")} aria-hidden />
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
    "relative z-10 inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:h-9 sm:touch:h-11";
  if (!href) {
    return (
      <span aria-disabled="true" title="Compare holds four. Remove one to add another." className={cn(cls, "cursor-not-allowed text-ink-400")}>
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
      className={cn(cls, selected ? "text-ink-900" : "text-ink-700 hover:bg-ink-100 hover:text-ink-900")}
    >
      {box}
      Compare
    </Link>
  );
}

/**
 * One candidate as a wide list row (Upwork's talent row): photo, initials and
 * the score pill, degree · place, then price / availability on one line, the skills,
 * and Save · Compare · Send proposal. On a phone the same row stacks into a card.
 */
export function CandidateCard({
  candidate,
  currency,
  region,
  selected,
  compareHref,
  comparable = true,
  projectId,
  shortlisted,
  nameUnlocked = false,
  hired = false,
  pricing: resolved,
  proposal = null,
  fullTimeFrom = null,
  fullTime = null,
  wantedSkills = [],
  presence = null,
  interested = false,
  pendingMeetingAt = null,
}: CandidateCardProps) {
  const pricing = resolved ?? resolvePricing(candidate.score, [], currency, region);
  const displayName = displayNameOf(candidate, nameUnlocked);
  const status = candidateStatusPill(proposal);
  const showHired = hired && status?.label !== "Hired";
  const wantedSet = new Set(wantedSkills.map((w) => w.trim().toLowerCase()));
  // Lead with the top skills (the schema has no role or headline); the degree moves to the meta line.
  const { lead, rest } = skillLead(candidate.skills, wantedSet);
  const headline = lead || headlineOf(candidate);
  const study = lead ? studyOf(candidate.academics) : "";
  const profileHref = `/employer/intern/${encodeURIComponent(candidate.id)}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`;
  const sendHref = `/employer/send-proposal?intern=${encodeURIComponent(candidate.id)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`;
  const place = candidate.city || candidate.location || "City not stated";
  const modes = candidate.workModes.join(" / ");
  const canSave = !proposal && Boolean(projectId);

  // One filled button per row: "Send proposal"; an offer already out is an outline link to it.
  const primary = proposal ? (
    <ButtonLink href={`/employer/proposal/${encodeURIComponent(proposal.id)}`} variant="outline" size="sm" className="relative z-10 h-11 sm:h-9 sm:touch:h-11">
      {proposalActionLabel(proposal)}
    </ButtonLink>
  ) : sendProposalHold(pendingMeetingAt) ? (
    <SendProposalHold pendingMeetingAt={pendingMeetingAt} className="relative z-10" />
  ) : (
    <ButtonLink href={sendHref} variant="primary" size="sm" className="relative z-10 h-11 rounded-full px-4 sm:h-9 sm:touch:h-11">
      <Send className="size-4" aria-hidden />
      Send proposal
    </ButtonLink>
  );

  const wanted = skillMatch(candidate.skills, wantedSkills);

  return (
    <li className="group/row relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 py-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-5 sm:py-7">
      <RowAvatar photoUrl={candidate.photoUrl} initials={candidate.initials} seed={candidate.id} presence={presence} />

      {/* Who: name, then what they are (the headline is what an employer scans), where, and why they fit. */}
      <div className="min-w-0 self-center sm:self-start">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          {/* The whole row opens the profile: this link is stretched over it; the controls sit above. */}
          <Link
            href={profileHref}
            className="-my-2 inline-flex h-11 min-w-11 items-center text-sm font-medium text-ink-600 outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] group-hover/row:text-brand-800 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
          >
            {displayName}
          </Link>
          {hired && proposal?.status !== "hired" ? <Pill tone="live" className="shrink-0 whitespace-nowrap">Hired</Pill> : null}
          {status ? <Pill tone={status.tone} className="shrink-0 whitespace-nowrap">{status.label}</Pill> : null}
          {interested ? (
            <Pill tone="live" className="shrink-0 whitespace-nowrap">
              Interested in this role
            </Pill>
          ) : null}
        </div>
        {headline ? (
          <p className="line-clamp-2 text-pretty text-lg font-medium leading-snug text-ink-900 group-hover/row:text-brand-800">
            {headline}
          </p>
        ) : null}
        <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-ink-600">
          <MapPin className="size-3.5 shrink-0 text-ink-400" aria-hidden />
          {study ? <span className="max-sm:hidden">{study} ·</span> : null}
          <span>{place}</span>
          {modes ? <span>, {modes}</span> : null}
          {/* The dot alone is colour only; say it in words (a coarse label, nothing when the candidate hides it). */}
          {presence ? <span className={cn("whitespace-nowrap", presence === PRESENCE_ONLINE && "font-medium text-success")}>, {presence}</span> : null}
        </p>
        {wanted.total > 0 ? (
          <p className="mt-1.5 text-sm text-ink-600">
            <span className="nums font-medium text-ink-900">{wanted.matched.length} of {wanted.total}</span> skills you asked for
          </p>
        ) : null}
      </div>

      {/* The numbers: the Findtern Score and the rate, right-aligned from sm up. */}
      <div className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-1 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:flex-col sm:items-end sm:gap-y-2">
        <ScoreBadge size="hero" score={candidate.score} scored={candidate.scored} />
        <p className="nums text-base font-medium text-ink-900">{formatRate(pricing.hourlyRateMinor, currency)}</p>
      </div>

      <SkillChips className="col-span-2 sm:col-span-2 sm:col-start-2" skills={candidate.skills} wanted={wantedSkills} skip={lead ? candidate.skills.length - rest.length : 0} />

      {/* Actions: Compare on the left, Save and the one primary action on the right. */}
      <div className="relative z-10 col-span-2 flex items-center justify-between gap-2 border-t border-ink-100 pt-3 sm:col-span-2 sm:col-start-2">
        {comparable ? <CompareToggle href={compareHref} selected={selected} name={displayName} /> : <span />}
        <div className="flex items-center gap-1.5">
          {canSave && projectId ? <SaveToggle internId={candidate.id} projectId={projectId} shortlisted={shortlisted} name={displayName} /> : null}
          {fullTimeFrom && fullTime ? (
            <FullTimeOfferButton
              employerId={fullTime.employerId}
              proposalId={fullTimeFrom}
              candidate={displayName}
              fteStatus={fullTime.fteStatus}
              timezone={fullTime.timezone}
            />
          ) : null}
          {primary}
        </div>
      </div>
    </li>
  );
}
