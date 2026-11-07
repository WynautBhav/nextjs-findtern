"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Eye, FileText, MapPin, Scale, Send } from "lucide-react";

import { bandFor } from "@/lib/score";
import { formatMoney, formatRate } from "@/lib/format";
import { RATING_META, displayNameOf, type CandidateProfile, type Ratings } from "@/lib/employer-candidates";
import { resolvePricing, type Currency, type Pricing } from "@/lib/employer-pricing";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { Avatar } from "@/components/app/avatar";
import { ScoreDial } from "@/components/app/score-dial";
import { skillMatch } from "@/components/app/skill-match";
import { MetaList } from "@/components/app/meta-list";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { FullTimeOfferButton } from "@/components/employer/full-time-offer-button";
import { candidateStatusPill, proposalActionLabel, type CandidateProposal } from "@/components/employer/candidate-status";
import { DetailRow, Pill, SectionHead } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/** Card-width labels for the four rating axes; the full label stays in `title`. */
export const SHORT_LABEL: Record<keyof Ratings, string> = {
  communication: "Comms",
  coding: "Coding",
  aptitude: "Aptitude",
  // "AI interview" was cut to "AI intervie…" in a four-column meter at 375
  // (QA-117); every axis here is from the AI interview.
  interview: "Interview",
};

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
  /** Resolved server-side against the CMS rate card; falls back to the bands. */
  pricing?: Pricing;
  /** This employer's live or hired offer to the candidate, if any. */
  proposal?: CandidateProposal | null;
  /** Internship hire a full-time offer can follow from (EMH-42), with context. */
  fullTimeFrom?: string | null;
  fullTime?: FullTimeContext | null;
  /** Skills the list is filtered by: matching chips are tinted and listed first. */
  wantedSkills?: string[];
  /** Position in the list, for the entrance stagger. */
  index?: number;
}

/** The four AI interview axes as one compact meter. "-" when an axis is unrated. */
export function RatingMeter({ ratings, className }: { ratings: Ratings; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-4 gap-x-2 sm:gap-x-3", className)}>
      {RATING_META.map((meta) => {
        const value = ratings[meta.key];
        return (
          // Labels wrap rather than cut; the figure sits at the bottom so the
          // four stay level if one label takes two lines.
          <div key={meta.key} className="flex min-w-0 flex-col justify-between">
            <dt className="break-words text-xs leading-snug text-ink-600" title={meta.label}>
              {SHORT_LABEL[meta.key]}
            </dt>
            <dd className="mt-0.5">
              <span className="nums text-sm font-semibold text-ink-900">{value > 0 ? value.toFixed(1) : "-"}</span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-ink-200/80" aria-hidden>
                <span className="block h-full rounded-full bg-[linear-gradient(90deg,var(--color-brand-400),var(--color-brand-700))]" style={{ width: `${Math.min(100, value * 10)}%` }} />
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function skillName(skill: string): string {
  return skill.split(" · ")[0].trim();
}

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
  pricing: resolved,
  proposal = null,
  fullTimeFrom = null,
  fullTime = null,
  wantedSkills = [],
  index = 0,
}: CandidateCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const band = bandFor(candidate.score);
  const pricing = resolved ?? resolvePricing(candidate.score, [], currency, region);
  const displayName = displayNameOf(candidate, nameUnlocked);
  const status = candidateStatusPill(proposal);
  const wanted = new Set(wantedSkills.map((s) => s.trim().toLowerCase()));
  const isWanted = (skill: string) => wanted.has(skillName(skill).toLowerCase());
  const skills = [...candidate.skills.filter(isWanted), ...candidate.skills.filter((s) => !isWanted(s))];
  const profileHref = `/employer/intern/${encodeURIComponent(candidate.id)}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`;
  const sendHref = `/employer/send-proposal?intern=${encodeURIComponent(candidate.id)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`;

  const wantedList = wantedSkills.map((s) => s.trim()).filter(Boolean);
  const matchCount = skillMatch(candidate.skills.map(skillName), wantedList);
  const hasWanted = matchCount.total > 0;
  const shownSkills = skills.slice(0, 3);
  const moreSkills = skills.length - shownSkills.length;
  const secondary = "relative z-10 min-h-10 rounded-full px-4 touch:min-h-11";

  // Exactly one primary action per card, always bottom-left.
  const primary = proposal ? (
    <ButtonLink href={`/employer/proposal/${encodeURIComponent(proposal.id)}`} variant="primary" size="sm" className={secondary}>
      {proposalActionLabel(proposal)}
    </ButtonLink>
  ) : (
    <ButtonLink href={sendHref} variant="primary" size="sm" className={secondary}>
      <Send className="size-4" aria-hidden />
      Send proposal
    </ButtonLink>
  );
  const fullTimeOffer =
    fullTimeFrom && fullTime ? (
      <FullTimeOfferButton
        employerId={fullTime.employerId}
        proposalId={fullTimeFrom}
        candidate={displayName}
        fteStatus={fullTime.fteStatus}
        timezone={fullTime.timezone}
      />
    ) : null;
  // The drawer has room for everything: the shortlist (labelled), the primary, the full-time offer.
  const actions = (
    <>
      {primary}
      {!proposal && projectId ? <ShortlistToggle internId={candidate.id} projectId={projectId} shortlisted={shortlisted} size="sm" /> : null}
      {fullTimeOffer}
    </>
  );

  // A quiet icon: the label carries the state.
  const iconBtn = "relative z-10 inline-flex size-11 items-center justify-center rounded-full text-ink-600 outline-none transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-[3px] focus-visible:ring-brand-600/30";
  const tip = (text: string, child: React.ReactElement) => (
    <Tooltip>
      <TooltipTrigger asChild>{child}</TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
  const slot = "flex size-11 shrink-0 items-center justify-center";
  const compareIcon = !comparable
    ? null
    : compareHref
      ? tip(
          selected ? "In compare: remove" : "Add to compare",
          <Link
            href={compareHref}
            scroll={false}
            aria-label={selected ? `In compare: remove ${displayName}` : `Add ${displayName} to compare`}
            className={cn(iconBtn, selected && "bg-brand-50 text-brand-800")}
          >
            {selected ? <Check className="size-5" aria-hidden /> : <Scale className="size-5" aria-hidden />}
          </Link>,
        )
      : tip(
          "Compare shows up to four candidates. Remove one to add another.",
          <span tabIndex={0} role="button" aria-disabled="true" aria-label="Compare is full (4)" className={cn(iconBtn, "opacity-40")}>
            <Scale className="size-5" aria-hidden />
          </span>,
        );

  const compareControl = !comparable ? null : compareHref ? (
    <Link
      href={compareHref}
      scroll={false}
      aria-label={selected ? "In compare: remove" : undefined}
      className={buttonClass({ variant: "outline", size: "sm", className: cn("min-h-11", selected && "bg-brand-50 font-semibold text-brand-800") })}
    >
      {selected ? <Check className="size-4" aria-hidden /> : <Scale className="size-4" aria-hidden />}
      {selected ? "In compare" : "Compare"}
    </Link>
  ) : (
    <button
      type="button"
      disabled
      className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
      title="Compare shows up to four candidates. Remove one to add another."
    >
      <Scale className="size-4" aria-hidden />
      Compare full (4)
    </button>
  );

  const axes = {
    communication: candidate.ratings.communication > 0 ? candidate.ratings.communication : null,
    coding: candidate.ratings.coding > 0 ? candidate.ratings.coding : null,
    aptitude: candidate.ratings.aptitude > 0 ? candidate.ratings.aptitude : null,
    interview: candidate.ratings.interview > 0 ? candidate.ratings.interview : null,
  };
  const rateMinor = pricing.hourlyRateMinor;

  return (
    <li
      style={{ ["--i" as string]: Math.min(index, 11) }}
      className="rise tile-lift group relative flex flex-col rounded-[24px] bg-white p-5 focus-within:ring-2 focus-within:ring-brand-600/30 lg:p-6"
    >
      <div className="flex items-start gap-4">
        <Avatar src={candidate.photoUrl} initials={candidate.initials} masked={!nameUnlocked} name={nameUnlocked ? displayName : undefined} size="lg" />
        <div className="min-w-0 flex-1 pt-0.5">
          {/* The whole card opens the profile: this link is stretched over it. */}
          <Link
            href={profileHref}
            className="block break-words rounded-apple-sm text-lg font-medium leading-snug tracking-[-0.01em] text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] hover:text-brand-700 focus-visible:after:rounded-[24px] focus-visible:after:ring-2 focus-visible:after:ring-brand-600"
          >
            {displayName}
          </Link>
          <div className="mt-1">
            <MetaList
              items={[
                { icon: <MapPin />, text: candidate.city || candidate.location || "City not stated" },
                { text: candidate.workModes.join(" · ") },
              ]}
            />
          </div>
        </div>
        {candidate.scored ? (
          <ScoreDial score={candidate.score} axes={axes} size="sm" showBand={false} />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-full border border-dashed border-ink-200 text-center text-[11px] leading-tight text-text-subtle">
            Not scored
          </span>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <p className="nums text-[2.25rem] font-light leading-none tracking-[-0.045em] text-ink-900">
          {formatMoney(rateMinor, currency)}
          {rateMinor > 0 ? <span className="ml-1 text-sm font-normal tracking-normal text-text-subtle">/hr</span> : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {status ? <Pill tone={status.tone} size="sm">{status.label}</Pill> : null}
          <Pill tone="neutral" size="sm">{band.name}</Pill>
        </div>
      </div>

      {hasWanted ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-xs text-text-subtle">
            <span>Skill match</span>
            <span>
              <span className="nums text-sm font-semibold text-ink-900">{matchCount.matched.length}</span> of <span className="nums">{matchCount.total}</span>
            </span>
          </div>
          <div aria-hidden className="flex gap-1">
            {Array.from({ length: matchCount.total }, (_, i) => (
              <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < matchCount.matched.length ? "bg-brand-600" : "bg-ink-200")} />
            ))}
          </div>
        </div>
      ) : null}

      {shownSkills.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Skills">
          {shownSkills.map((skill) => (
            <li
              key={skill}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                isWanted(skill) ? "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200/80" : "bg-ink-100 text-ink-700",
              )}
            >
              {isWanted(skill) ? <Check className="size-3" aria-hidden /> : null}
              {skillName(skill)}
              {isWanted(skill) ? <span className="sr-only"> (matches)</span> : null}
            </li>
          ))}
          {moreSkills > 0 ? <li className="nums px-1 py-1 text-xs text-text-subtle">+{moreSkills}</li> : null}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-text-subtle">No skills listed yet.</p>
      )}

      {candidate.scored ? (
        <div className="mt-4 rounded-[18px] bg-ink-50 px-4 py-3">
          <RatingMeter ratings={candidate.ratings} />
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-5">
        <div className="flex min-w-0 items-center gap-3">{primary}</div>
        {/* Three reserved slots: the icons never shift, hired or not. */}
        <div className="-mr-2 flex shrink-0 items-center">
          <span className={slot}>
            {!proposal && projectId ? (
              <ShortlistToggle internId={candidate.id} projectId={projectId} shortlisted={shortlisted} variant="icon" className="relative z-10" />
            ) : null}
          </span>
          <span className={slot}>
            {tip(
              "Quick view",
              <button type="button" onClick={() => setDrawerOpen(true)} aria-label={`Quick view of ${displayName}`} className={iconBtn}>
                <Eye className="size-5" aria-hidden />
              </button>,
            )}
          </span>
          <span className={slot}>{compareIcon}</span>
        </div>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto border-l border-ink-200/80 bg-surface p-0 sm:max-w-xl">
          <div className="space-y-6 p-5 sm:p-7">
            <div className="flex items-start gap-4 pr-8">
              <CandidateAvatar
                photoUrl={candidate.photoUrl}
                initials={candidate.initials}
                className="size-14 rounded-apple-lg text-lg ring-1 ring-inset ring-brand-200/70"
              />
              <div className="min-w-0 flex-1">
                <SheetTitle className="break-words text-2xl font-semibold text-ink-900">{displayName}</SheetTitle>
                <SheetDescription className="mt-1 text-sm text-ink-600">
                  {candidate.location || "Location not stated"}
                </SheetDescription>
                {status ? (
                  <div className="mt-2">
                    <Pill tone={status.tone}>{status.label}</Pill>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[18px] bg-white shadow-tile p-4">
                <p className="text-sm font-medium text-ink-600">Findtern Score</p>
                <p className="nums mt-1 text-3xl font-semibold text-brand-700">
                  {candidate.scored ? candidate.score.toFixed(1) : "-"}
                  <span className="ml-0.5 text-sm font-medium text-text-subtle">/10</span>
                </p>
                <p className="mt-1 text-sm text-ink-600">{band.name}</p>
              </div>
              <div className="rounded-[18px] bg-white shadow-tile p-4">
                <p className="text-sm font-medium text-ink-600">Price</p>
                <p className="nums mt-2.5 text-2xl font-semibold text-ink-900">
                  {formatRate(pricing.hourlyRateMinor, currency)}
                </p>
                <p className="mt-1 text-sm text-ink-600">
                  {pricing.perHireMinor > 0 ? `plus ${formatMoney(pricing.perHireMinor, currency)} per hire` : "Hourly, by band"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-2">
              {actions}
              {compareControl}
              <ButtonLink href={profileHref} variant="ghost" size="sm" className="min-h-10 touch:min-h-11">
                Full profile
                <ArrowUpRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>

            <section>
              <SectionHead title="AI interview ratings" hint="Each axis out of 10." />
              <div className="rounded-[18px] bg-white shadow-tile p-4">
                <RatingMeter ratings={candidate.ratings} />
              </div>
              {candidate.aiFeedbackLink ? (
                <a
                  href={candidate.aiFeedbackLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: "outline", size: "sm", className: "mt-3 min-h-10 touch:min-h-11" })}
                >
                  <FileText className="size-4" aria-hidden />
                  Feedback report
                </a>
              ) : null}
              {candidate.scored ? (
                <Link href={`${profileHref}#ai-report`} className="mt-3 ml-1 inline-flex min-h-10 touch:min-h-11 items-center text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
                  Full AI interview report
                </Link>
              ) : null}
            </section>

            <section>
              <SectionHead title="Skills" />
              {skills.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {skills.map((skill) => (
                    <li
                      key={skill}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        isWanted(skill) ? "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200" : "bg-ink-100 text-ink-700",
                      )}
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-600">No skills listed.</p>
              )}
            </section>

            <section>
              <SectionHead title="Work preferences" />
              <dl className="divide-y divide-ink-100 rounded-[18px] bg-white shadow-tile px-4">
                <DetailRow label="Work mode" value={candidate.workModes.join(", ") || "Not stated"} />
                <DetailRow
                  label="Preferred cities"
                  value={candidate.preferredLocations.map((l) => l.split(",")[0].trim()).join(", ") || "Not stated"}
                />
                <DetailRow
                  label="Laptop"
                  value={candidate.hasLaptop === true ? "Has a laptop" : candidate.hasLaptop === false ? "Needs one provided" : "Not stated"}
                />
              </dl>
            </section>

            {candidate.academics ? (
              <section>
                <SectionHead title="Academics" />
                <div className="rounded-[18px] bg-white shadow-tile p-4">
                  <p className="text-base font-medium text-ink-900">
                    {[candidate.academics.degree, candidate.academics.specialization].filter(Boolean).join(" · ") || "Degree not stated"}
                  </p>
                  {candidate.academics.institution ? <p className="mt-0.5 text-sm text-ink-600">{candidate.academics.institution}</p> : null}
                  <p className="nums mt-2 text-sm text-ink-600">
                    {[
                      candidate.academics.startYear || candidate.academics.endYear
                        ? `${candidate.academics.startYear || "?"} – ${candidate.academics.endYear || "?"}`
                        : "",
                      candidate.academics.score
                        ? `${candidate.academics.scoreType === "percentage" ? "Percentage" : "CGPA"} ${candidate.academics.score}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </section>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </li>
  );
}
