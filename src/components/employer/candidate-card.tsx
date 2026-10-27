"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Eye, FileText, Laptop, MapPin, Scale, Send } from "lucide-react";

import { bandFor } from "@/lib/score";
import { formatMoney, formatRate } from "@/lib/format";
import { RATING_META, displayNameOf, type CandidateProfile, type Ratings } from "@/lib/employer-candidates";
import { resolvePricing, type Currency, type Pricing } from "@/lib/employer-pricing";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { FullTimeOfferButton } from "@/components/employer/full-time-offer-button";
import { candidateStatusPill, proposalActionLabel, type CandidateProposal } from "@/components/employer/candidate-status";
import { DetailRow, Pill, SectionHead } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/** Card-width labels for the four rating axes; the full label stays in `title`. */
export const SHORT_LABEL: Record<keyof Ratings, string> = {
  communication: "Comms",
  coding: "Coding",
  aptitude: "Aptitude",
  interview: "AI interview",
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
}

/** The four AI interview axes as one compact meter. "-" when an axis is unrated. */
export function RatingMeter({ ratings, className }: { ratings: Ratings; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-4 gap-x-3", className)}>
      {RATING_META.map((meta) => {
        const value = ratings[meta.key];
        return (
          <div key={meta.key} className="min-w-0">
            <dt className="truncate text-xs text-ink-600" title={meta.label}>
              {SHORT_LABEL[meta.key]}
            </dt>
            <dd className="mt-0.5">
              <span className="nums text-sm font-semibold text-ink-900">{value > 0 ? value.toFixed(1) : "-"}</span>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, value * 10)}%` }} />
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

  const actions = (
    <>
      {proposal ? (
        <ButtonLink href={`/employer/proposal/${encodeURIComponent(proposal.id)}`} variant="outline" size="sm" className="min-h-10">
          {proposalActionLabel(proposal)}
        </ButtonLink>
      ) : projectId ? (
        <>
          <ShortlistToggle internId={candidate.id} projectId={projectId} shortlisted={shortlisted} size="sm" emphasis="primary" />
          <ButtonLink href={sendHref} variant={shortlisted ? "primary" : "outline"} size="sm" className="min-h-10">
            <Send className="size-4" aria-hidden />
            Send proposal
          </ButtonLink>
        </>
      ) : (
        <ButtonLink href={sendHref} variant="primary" size="sm" className="min-h-10">
          <Send className="size-4" aria-hidden />
          Send proposal
        </ButtonLink>
      )}
      {fullTimeFrom && fullTime ? (
        <FullTimeOfferButton
          employerId={fullTime.employerId}
          proposalId={fullTimeFrom}
          candidate={displayName}
          fteStatus={fullTime.fteStatus}
          timezone={fullTime.timezone}
        />
      ) : null}
    </>
  );

  const compareControl = !comparable ? null : compareHref ? (
    <Link
      href={compareHref}
      scroll={false}
      // A link, so no aria-pressed: the label carries the state.
      aria-label={selected ? "Remove from compare" : "Add to compare"}
      className={buttonClass({
        variant: "ghost",
        size: "sm",
        className: cn("min-h-10 px-2.5", selected ? "bg-brand-50 font-semibold text-brand-800" : "text-ink-700"),
      })}
    >
      {selected ? <Check className="size-4" aria-hidden /> : <Scale className="size-4" aria-hidden />}
      {selected ? "In compare" : "Compare"}
    </Link>
  ) : (
    <span className="inline-flex min-h-10 items-center gap-2 px-2.5 text-sm text-text-subtle" title="Compare shows up to four candidates. Remove one to add another.">
      <Scale className="size-4" aria-hidden />
      Compare full (4)
    </span>
  );

  return (
    <li className="apple-spring flex min-w-0 flex-col rounded-apple-xl border border-ink-200/80 bg-white p-5 shadow-xs hover:border-brand-300 hover:shadow-sm">
      {/* Identity, then the score as the hero on the right. */}
      <div className="flex items-start gap-4">
        <CandidateAvatar
          photoUrl={candidate.photoUrl}
          initials={candidate.initials}
          className="size-12 rounded-apple-md text-base ring-1 ring-inset ring-brand-200/70"
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            title={`Quick view of ${displayName}`}
            className="max-w-full truncate rounded-apple-sm text-left text-base font-semibold tracking-[-0.01em] text-ink-900 hover:text-brand-700"
          >
            {displayName}
          </button>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600">
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0 text-ink-400" aria-hidden />
              <span className="truncate">{candidate.city || candidate.location || "City not stated"}</span>
            </span>
            {candidate.hasLaptop !== null ? (
              <span className={cn("inline-flex items-center gap-1", candidate.hasLaptop ? "text-brand-800" : "text-ink-600")}>
                <Laptop className="size-3.5 shrink-0" aria-hidden />
                {candidate.hasLaptop ? "Own laptop" : "Needs a laptop"}
              </span>
            ) : null}
          </p>
          {candidate.workModes.length > 0 ? (
            <p className="mt-0.5 truncate text-sm text-ink-600">{candidate.workModes.join(" · ")}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-brand-700">{band.name}</p>
          <p
            className="nums mt-0.5 text-3xl font-semibold leading-none tracking-[-0.02em] text-brand-700"
            title={candidate.scored ? `Findtern Score ${candidate.score.toFixed(1)} out of 10` : "Not scored yet"}
          >
            {candidate.scored ? candidate.score.toFixed(1) : "-"}
            <span className="ml-0.5 text-sm font-medium text-text-subtle">/10</span>
          </p>
          <p className="nums mt-1.5 text-sm font-semibold text-ink-900">{formatRate(pricing.hourlyRateMinor, currency)}</p>
        </div>
      </div>

      {status ? (
        <div className="mt-3">
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
      ) : null}

      {candidate.bio ? <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-600">{candidate.bio}</p> : null}

      {/* Every skill (a profile holds at most seven), never "+N more". */}
      {skills.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
          {skills.map((skill) => (
            <li
              key={skill}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                isWanted(skill) ? "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200" : "bg-ink-100 text-ink-700",
              )}
            >
              {skill}
              {isWanted(skill) ? <span className="sr-only"> (matches)</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-600">No skills listed yet.</p>
      )}

      <RatingMeter ratings={candidate.ratings} className="mt-4 border-t border-ink-100 pt-4" />

      <div className="mt-auto pt-4">
        <div className="flex flex-wrap items-start gap-2">{actions}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-ink-100 pt-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-10 px-2.5 text-ink-700" })}
          >
            <Eye className="size-4" aria-hidden />
            Quick view
          </button>
          {compareControl}
          <Link href={profileHref} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-10 px-2.5 text-ink-700" })}>
            Profile
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
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
                <SheetTitle className="truncate text-2xl font-semibold tracking-[-0.02em] text-ink-900">{displayName}</SheetTitle>
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
              <div className="rounded-apple-lg border border-ink-200/80 bg-white p-4">
                <p className="text-sm font-medium text-ink-600">Findtern Score</p>
                <p className="nums mt-1 text-3xl font-semibold tracking-[-0.02em] text-brand-700">
                  {candidate.scored ? candidate.score.toFixed(1) : "-"}
                  <span className="ml-0.5 text-sm font-medium text-text-subtle">/10</span>
                </p>
                <p className="mt-1 text-sm text-ink-600">{band.name}</p>
              </div>
              <div className="rounded-apple-lg border border-ink-200/80 bg-white p-4">
                <p className="text-sm font-medium text-ink-600">Price</p>
                <p className="nums mt-2.5 text-2xl font-semibold tracking-[-0.02em] text-ink-900">
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
              <ButtonLink href={profileHref} variant="ghost" size="sm" className="min-h-10">
                Full profile
                <ArrowUpRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>

            <section>
              <SectionHead title="AI interview ratings" hint="Each axis out of 10." />
              <div className="rounded-apple-lg border border-ink-200/80 bg-white p-4">
                <RatingMeter ratings={candidate.ratings} />
              </div>
              {candidate.aiFeedbackLink ? (
                <a
                  href={candidate.aiFeedbackLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: "outline", size: "sm", className: "mt-3 min-h-10" })}
                >
                  <FileText className="size-4" aria-hidden />
                  Feedback report
                </a>
              ) : null}
              {candidate.scored ? (
                <Link href={`${profileHref}#ai-report`} className="mt-3 ml-1 inline-flex min-h-10 items-center text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
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
              <dl className="divide-y divide-ink-100 rounded-apple-lg border border-ink-200/80 bg-white px-4">
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
                <div className="rounded-apple-lg border border-ink-200/80 bg-white p-4">
                  <p className="text-[0.9375rem] font-medium text-ink-900">
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
