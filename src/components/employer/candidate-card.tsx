"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Eye,
  ExternalLink,
  GraduationCap,
  Laptop,
  MapPin,
  Scale,
  Send,
} from "lucide-react";

import { bandFor } from "@/lib/score";
import { formatRate } from "@/lib/format";
import {
  RATING_META,
  displayNameOf,
  type CandidateProfile,
} from "@/lib/employer-candidates";
import { resolvePricing, type Currency, type Pricing } from "@/lib/employer-pricing";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { AiFeedbackReport } from "@/components/employer/ai-feedback-report";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { Pill } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";

/** Card-width labels for the four rating axes; the full label stays in `title`. */
const SHORT_LABEL: Partial<Record<(typeof RATING_META)[number]["key"], string>> = {
  communication: "Comms",
  coding: "Coding",
  aptitude: "Aptitude",
  interview: "Interview",
};

export interface CandidateCardProps {
  candidate: CandidateProfile;
  currency: Currency;
  region: "IN" | null;
  selected: boolean;
  compareHref: string;
  projectId: string | null;
  shortlisted: boolean;
  /** True when this employer hired the candidate - the only case the full name shows. */
  nameUnlocked?: boolean;
  /** Resolved server-side against the CMS rate card; falls back to the bands. */
  pricing?: Pricing;
  /** This employer's latest open or hired proposal to the candidate, if any. */
  proposal?: { id: string; status: string } | null;
}

/** Legacy cards changed their action once a proposal existed (dashboard:2513). */
function ProposalAction({
  candidateId,
  projectId,
  proposal,
  className,
}: {
  candidateId: string;
  projectId: string | null;
  proposal: { id: string; status: string } | null;
  className?: string;
}) {
  if (proposal) {
    return (
      <ButtonLink
        href={`/employer/proposal/${encodeURIComponent(proposal.id)}`}
        variant="outline"
        size="sm"
        className={className}
      >
        <span>{proposal.status === "hired" ? "Hired - view placement" : "View proposal"}</span>
      </ButtonLink>
    );
  }
  const query = `intern=${encodeURIComponent(candidateId)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`;
  return (
    <ButtonLink href={`/employer/send-proposal?${query}`} variant="primary" size="sm" className={className}>
      <Send className="size-3.5" aria-hidden />
      <span>Send proposal</span>
    </ButtonLink>
  );
}

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
}: CandidateCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const band = bandFor(candidate.score);
  const pricing = resolved ?? resolvePricing(candidate.score, [], currency, region);
  const assessed = RATING_META.filter((meta) => candidate.ratings[meta.key] > 0);
  const displayName = displayNameOf(candidate, nameUnlocked);

  return (
    <li className="apple-spring group relative flex min-w-0 flex-col justify-between rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] hover:border-brand-400">
      <div>
        {/* Top Header: Avatar + Identity + Hero Score Gauge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            {/* Photo, or a flat initial tile - no gradient, no floating badge.
                The band pill beside the name already carries the tier. */}
            <CandidateAvatar
              photoUrl={candidate.photoUrl}
              initials={candidate.initials}
              className="size-12 rounded-[10px] text-base border border-brand-200/80"
            />

            {/* Candidate Name, Band & Metadata */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  title={displayName}
                  className="inline-flex min-h-7 items-center text-left font-semibold tracking-[-0.01em] text-ink-900 hover:text-brand-700 line-clamp-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-[10px]"
                >
                  {displayName}
                </button>
                <Pill tone="live">{band.name}</Pill>
                {proposal ? (
                  <Pill tone={proposal.status === "hired" ? "live" : "waiting"}>
                    {proposal.status === "hired" ? "Hired" : `Proposal ${proposal.status}`}
                  </Pill>
                ) : null}
              </div>

              {/* Location, Work Modes & Hardware */}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-subtle">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5 shrink-0 text-ink-400" aria-hidden />
                  <span className="truncate" title={candidate.location || "Location not stated"}>{candidate.location || "Location not stated"}</span>
                </span>
                {candidate.workModes.length > 0 ? (
                  <>
                    <span className="text-ink-300" aria-hidden>·</span>
                    <span className="capitalize">{candidate.workModes.join(", ")}</span>
                  </>
                ) : null}
                {candidate.hasLaptop ? (
                  <>
                    <span className="text-ink-300" aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium text-xs">
                      <Laptop className="size-3" aria-hidden />
                      Laptop Ready
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Score figure + rate - data, not a badge. No dark block, no
              uppercase micro-label. */}
          <div className="shrink-0 text-right">
            <p
              className="text-xl font-bold tabular-nums tracking-tight text-ink-900"
              title={candidate.scored ? `${band.name}: ${candidate.score.toFixed(1)} out of 10` : "Not scored yet"}
            >
              {candidate.scored ? candidate.score.toFixed(1) : "-"}
              {candidate.scored ? (
                <span className="text-xs font-medium tabular-nums text-text-subtle">/10</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs font-bold tabular-nums text-brand-700">
              {formatRate(pricing.hourlyRateMinor, currency)}
            </p>
          </div>
        </div>

        {/* Bio summary */}
        {candidate.bio ? (
          <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-ink-600">
            {candidate.bio}
          </p>
        ) : null}

        {/* Skills - the single chip recipe. No hover animation on a chip. */}
        {candidate.skills.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1">
            {candidate.skills.slice(0, 5).map((skill) => (
              <li
                key={skill}
                className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700 border border-ink-200/70"
              >
                {skill}
              </li>
            ))}
            {candidate.skills.length > 5 ? (
              <li className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium tabular-nums text-ink-500 border border-ink-200/70">
                +{candidate.skills.length - 5} more
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-ink-400 italic">No skills listed yet.</p>
        )}

        {/* 4-Axis Technical Assessment Gauges */}
        {assessed.length > 0 ? (
          <div className="mt-3.5 grid grid-cols-2 gap-2 rounded-[10px] bg-ink-50/80 p-2.5 xl:grid-cols-4 border border-ink-200/70">
            {assessed.map((meta) => {
              const val = candidate.ratings[meta.key];
              const pct = Math.min(100, (val / 10) * 100);
              return (
                <div key={meta.key} className="flex min-w-0 flex-col">
                  <div className="flex items-center justify-between gap-1 text-xs font-medium text-text-subtle">
                    <span className="truncate" title={meta.label}>
                      {SHORT_LABEL[meta.key] ?? meta.label}
                    </span>
                    <span className="text-xs font-bold tabular-nums text-ink-900">
                      {val.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-ink-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-600"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Card Action Deck: a 2x2 grid of full-width buttons until the card is
          wide enough (xl) for the two pairs to sit on one row. */}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-ink-200/70 pt-3 xl:flex xl:flex-wrap xl:items-center xl:justify-between">
        {/* Left: Quick View & Compare */}
        <div className="contents xl:flex xl:items-center xl:gap-1.5">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="apple-spring apple-pressable inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border border-ink-200/70 bg-white px-2.5 text-[13px] font-medium text-ink-700 hover:border-brand-300 hover:text-brand-800 xl:w-auto"
              >
                <Eye className="size-3.5 text-ink-500" aria-hidden />
                <span>Quick View</span>
              </button>
            </SheetTrigger>

            <SheetContent
              side="right"
              className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto p-0 border-l border-ink-200/70 bg-surface-alt"
            >
              <div className="p-6">
                <SheetHeader className="text-left pb-4 border-b border-ink-200/70">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <CandidateAvatar
                        photoUrl={candidate.photoUrl}
                        initials={candidate.initials}
                        className="size-14 rounded-[10px] text-lg tabular-nums border border-brand-200"
                      />
                      <div>
                        <SheetTitle className="text-xl font-bold text-ink-900">
                          {displayName}
                        </SheetTitle>
                        <SheetDescription className="mt-0.5 text-xs text-text-subtle">
                          {candidate.location || "Location not stated"}
                          {candidate.workModes.length > 0
                            ? ` · ${candidate.workModes.join(", ")}`
                            : ""}
                        </SheetDescription>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Pill tone="live">{band.name}</Pill>
                          <span className="text-xs font-semibold tabular-nums text-ink-800">
                            {candidate.scored
                              ? `${candidate.score.toFixed(1)}/10 Findtern Score`
                              : "Unscored"}
                          </span>
                          <span className="text-xs font-semibold tabular-nums text-brand-700">
                            · {formatRate(pricing.hourlyRateMinor, currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </SheetHeader>

                {/* Quick actions bar inside drawer */}
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[10px] bg-white p-3 border border-ink-200/70 shadow-2xs">
                  <ProposalAction
                    candidateId={candidate.id}
                    projectId={projectId}
                    proposal={proposal}
                    className="min-h-11 px-3.5 text-[13px] font-semibold"
                  />
                  {projectId ? (
                    <ShortlistToggle
                      internId={candidate.id}
                      projectId={projectId}
                      shortlisted={shortlisted}
                      size="sm"
                    />
                  ) : null}
                  <ButtonLink
                    href={`/employer/intern/${encodeURIComponent(candidate.id)}`}
                    variant="outline"
                    size="sm"
                    className="min-h-11 px-3 text-[13px] font-medium ml-auto"
                  >
                    <span>Full profile</span>
                    <ExternalLink className="size-3.5 text-ink-400" aria-hidden />
                  </ButtonLink>
                </div>

                {/* Candidate bio */}
                {candidate.bio ? (
                  <div className="mt-5 rounded-[10px] border border-ink-200/70 bg-white p-4">
                    <h3 className="text-[13px] font-semibold text-ink-900">
                      About candidate
                    </h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-ink-700 whitespace-pre-wrap">
                      {candidate.bio}
                    </p>
                  </div>
                ) : null}

                {/* Academics & Hardware */}
                {candidate.academics ? (
                  <div className="mt-4 rounded-[10px] border border-ink-200/70 bg-white p-4">
                    <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-900">
                      <GraduationCap className="size-4 text-brand-600" aria-hidden />
                      Academic background
                    </h3>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
                      <div className="min-w-0">
                        <span className="text-text-subtle block">Institution</span>
                        <span className="font-semibold text-ink-900">
                          {candidate.academics.institution || "-"}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-text-subtle block">Degree</span>
                        <span className="font-semibold text-ink-900">
                          {[candidate.academics.degree, candidate.academics.specialization]
                            .filter(Boolean)
                            .join(" - ") || "-"}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-text-subtle block">Score / CGPA</span>
                        <span className="font-semibold tabular-nums text-ink-900">
                          {candidate.academics.score
                            ? `${candidate.academics.score} ${candidate.academics.scoreType || ""}`
                            : "-"}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-text-subtle block">Hardware</span>
                        <span className="font-semibold text-ink-900 inline-flex items-center gap-1">
                          <Laptop className="size-3.5 text-ink-500" aria-hidden />
                          {candidate.hasLaptop === true
                            ? "Dedicated Work Laptop"
                            : candidate.hasLaptop === false
                            ? "Requires Laptop Support"
                            : "Not Specified"}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Verified Skills */}
                {candidate.skills.length > 0 ? (
                  <div className="mt-4 rounded-[10px] border border-ink-200/70 bg-white p-4">
                    <h3 className="text-[13px] font-semibold tabular-nums text-ink-900">
                      Verified skills ({candidate.skills.length})
                    </h3>
                    <ul className="mt-3 flex flex-wrap gap-1">
                      {candidate.skills.map((skill) => (
                        <li
                          key={skill}
                          className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700 border border-ink-200/70"
                        >
                          {skill}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* AI Interview Assessment Report */}
                <div className="mt-5">
                  <AiFeedbackReport
                    candidateName={displayName}
                    findternScore={candidate.score}
                    ratings={{
                      communication: candidate.ratings.communication,
                      coding: candidate.ratings.coding,
                      aptitude: candidate.ratings.aptitude,
                      overall: candidate.score,
                    }}
                    skills={candidate.skills}
                    bio={candidate.bio}
                    aiFeedbackLink={candidate.aiFeedbackLink}
                    aiRecordingLink={candidate.aiRecordingLink}
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Compare Toggle */}
          <Link
            href={compareHref}
            scroll={false}
            aria-pressed={selected}
            className={[
              "apple-spring apple-pressable inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border px-2.5 text-[13px] font-medium xl:w-auto",
              selected
                ? "border-brand-600 bg-brand-50 text-brand-700 font-semibold"
                : "border-ink-200/70 bg-white text-ink-700 hover:bg-ink-50",
            ].join(" ")}
          >
            {selected ? (
              <Check className="size-3.5 text-brand-600" aria-hidden />
            ) : (
              <Scale className="size-3.5 text-ink-400" aria-hidden />
            )}
            <span>{selected ? "Selected" : "Compare"}</span>
          </Link>

          <Link
            href={`/employer/intern/${encodeURIComponent(candidate.id)}`}
            className="apple-spring apple-pressable inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border border-ink-200/70 bg-white px-2.5 text-[13px] font-medium text-ink-700 hover:border-brand-300 hover:text-brand-800 xl:w-auto"
          >
            <span>View profile</span>
            <ArrowUpRight className="size-3.5 text-ink-400" aria-hidden />
          </Link>
        </div>

        {/* Right: Shortlist & Send Proposal */}
        <div className="contents xl:flex xl:items-center xl:gap-1.5">
          {projectId ? (
            <ShortlistToggle
              internId={candidate.id}
              projectId={projectId}
              shortlisted={shortlisted}
              size="sm"
              className="w-full xl:w-auto"
            />
          ) : null}

          <ProposalAction
            candidateId={candidate.id}
            projectId={projectId}
            proposal={proposal}
            className={[
              "min-h-11 w-full px-3 text-[13px] font-semibold xl:w-auto",
              // Quick View, Compare, View profile and Shortlist fill two rows of
              // the 2-column grid; without a project there is no Shortlist and
              // this button closes the second row instead of starting a third.
              projectId ? "col-span-2" : "",
            ].join(" ")}
          />
        </div>
      </div>
    </li>
  );
}
