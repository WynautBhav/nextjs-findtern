"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Eye,
  ExternalLink,
  FileText,
  Globe,
  Laptop,
  MapPin,
  Scale,
  Send,
  Star,
} from "lucide-react";

import { bandFor } from "@/lib/score";
import { formatRate } from "@/lib/format";
import {
  MODE_LABEL,
  RATING_META,
  displayNameOf,
  type CandidateProfile,
} from "@/lib/employer-candidates";
import { resolvePricing, type Currency, type Pricing } from "@/lib/employer-pricing";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
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
  /** False once this employer has hired them: compare leaves hires out. */
  comparable?: boolean;
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
  comparable = true,
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

        {/* Skills - the single chip recipe. No hover animation on a chip. Every
            skill is shown (a profile has at most seven), never "+N more". */}
        {candidate.skills.length > 0 ? (
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
        ) : (
          <p className="mt-3 text-xs text-ink-600 italic">No skills listed yet.</p>
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
              className="w-full overflow-y-auto border-l border-ink-200/70 bg-surface p-0 sm:max-w-xl md:max-w-3xl"
            >
              {/* Laid out like the legacy candidate page (employer-intern-detail):
                  summary card, actions, then two columns of sections. */}
              <div className="space-y-4 p-4 sm:p-6">
                <SheetHeader className="rounded-[20px] border border-ink-200/70 bg-white p-5 text-left shadow-2xs sm:p-6">
                  <div className="flex items-start gap-4">
                    <CandidateAvatar
                      photoUrl={candidate.photoUrl}
                      initials={candidate.initials}
                      className="size-16 rounded-[16px] text-xl tabular-nums"
                    />
                    <div className="min-w-0 flex-1">
                      <SheetTitle className="text-2xl font-semibold tracking-[-0.01em] text-ink-900">{displayName}</SheetTitle>
                      <SheetDescription className="mt-1 inline-flex items-center gap-1 text-sm text-ink-600">
                        <MapPin className="size-3.5 text-danger/70" aria-hidden />
                        {candidate.city || candidate.location || "Location not stated"}
                      </SheetDescription>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-brand-300 bg-brand-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-brand-800">
                          <Star className="size-3.5" aria-hidden />
                          Findtern score: {candidate.scored ? candidate.score.toFixed(1) : "Not scored"}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-ink-900 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
                          Price: {formatRate(pricing.hourlyRateMinor, currency)}
                        </span>
                        <Pill tone="live">{band.name}</Pill>
                      </div>
                    </div>
                  </div>
                </SheetHeader>

                <div className="flex flex-wrap items-center gap-2">
                  <ProposalAction
                    candidateId={candidate.id}
                    projectId={projectId}
                    proposal={proposal}
                    className="min-h-11 rounded-[12px] px-4 text-[13px] font-semibold"
                  />
                  {comparable ? (
                    <Link
                      href={compareHref}
                      scroll={false}
                      aria-label={selected ? "Remove from compare" : "Add to compare"}
                      className={[
                        "apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[12px] border px-4 text-[13px] font-medium",
                        selected
                          ? "border-brand-600 bg-brand-50 font-semibold text-brand-700"
                          : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
                      ].join(" ")}
                    >
                      {selected ? <Check className="size-3.5" aria-hidden /> : <Scale className="size-3.5 text-ink-400" aria-hidden />}
                      {selected ? "In Compare" : "Add to Compare"}
                    </Link>
                  ) : null}
                  {projectId ? (
                    <ShortlistToggle internId={candidate.id} projectId={projectId} shortlisted={shortlisted} size="sm" />
                  ) : null}
                  <ButtonLink
                    href={`/employer/intern/${encodeURIComponent(candidate.id)}`}
                    variant="outline"
                    size="sm"
                    className="ml-auto min-h-11 rounded-[12px] px-4 text-[13px] font-medium"
                  >
                    <span>Full profile</span>
                    <ExternalLink className="size-3.5 text-ink-400" aria-hidden />
                  </ButtonLink>
                </div>

                <div className="grid gap-4 md:grid-cols-[1.6fr_1.1fr]">
                  <div className="min-w-0 space-y-4">
                    <QuickSection title="Ratings">
                      {assessed.length > 0 ? (
                        <ul className="flex flex-wrap gap-2">
                          {assessed.map((meta) => (
                            <li
                              key={meta.key}
                              className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium tabular-nums text-ink-700"
                            >
                              {meta.key === "interview" ? "AI Interview" : meta.label}: {candidate.ratings[meta.key].toFixed(1)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-text-subtle">No ratings yet.</p>
                      )}
                    </QuickSection>

                    <QuickSection title="Skills & Tools">
                      {candidate.skills.length > 0 ? (
                        <ul className="flex flex-wrap gap-2">
                          {candidate.skills.map((skill) => (
                            <li
                              key={skill}
                              className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700"
                            >
                              {skill}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-text-subtle">No skills listed.</p>
                      )}
                    </QuickSection>

                    {candidate.academics ? (
                      <QuickSection title="Academics">
                        <p className="text-sm font-medium text-ink-900">
                          {[candidate.academics.degree, candidate.academics.specialization].filter(Boolean).join(" · ") || "Degree not stated"}
                        </p>
                        {candidate.academics.institution ? (
                          <p className="mt-0.5 text-sm text-ink-600">{candidate.academics.institution}</p>
                        ) : null}
                        <ul className="mt-2.5 flex flex-wrap gap-1.5">
                          {[
                            candidate.academics.startYear || candidate.academics.endYear
                              ? `${candidate.academics.startYear || "?"} – ${candidate.academics.endYear || "?"}`
                              : "",
                            candidate.academics.status,
                            candidate.academics.score
                              ? `${candidate.academics.scoreType === "percentage" ? "Percentage" : "CGPA"}: ${candidate.academics.score}`
                              : "",
                          ]
                            .filter(Boolean)
                            .map((badge) => (
                              <li key={badge} className="rounded-full border border-ink-200 bg-white px-2.5 py-0.5 text-xs tabular-nums text-ink-700">
                                {badge}
                              </li>
                            ))}
                        </ul>
                        {candidate.academics.courses.length > 0 ? (
                          <div className="mt-4 border-t border-ink-100 pt-3">
                            <p className="text-xs font-semibold text-ink-700">Professional courses</p>
                            <ul className="mt-1.5 space-y-1">
                              {candidate.academics.courses.map((course, i) => (
                                <li key={`${course.name}-${i}`} className="text-sm text-ink-700">
                                  {course.name}
                                  {course.institution ? <span className="text-text-subtle"> · {course.institution}</span> : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </QuickSection>
                    ) : null}
                  </div>

                  <div className="min-w-0 space-y-4">
                    <QuickSection title="Location & Work Preferences">
                      <dl className="space-y-3 text-sm">
                        <div>
                          <dt className="text-2xs font-semibold uppercase tracking-wide text-text-subtle">Preferred work mode</dt>
                          <dd className="mt-1 flex flex-wrap gap-1.5">
                            {candidate.workModes.length > 0
                              ? candidate.workModes.map((m) => (
                                  <span key={m} className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-ink-50 px-2.5 py-0.5 text-xs text-ink-700">
                                    <Globe className="size-3" aria-hidden />
                                    {MODE_LABEL[m] ?? m}
                                  </span>
                                ))
                              : <span className="text-text-subtle">Not stated</span>}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-2xs font-semibold uppercase tracking-wide text-text-subtle">Preferred locations</dt>
                          <dd className="mt-1 text-ink-700">
                            {candidate.preferredLocations.length > 0
                              ? candidate.preferredLocations.join(" · ")
                              : candidate.workModes.length === 1 && candidate.workModes[0] === "remote"
                                ? "Remote"
                                : "Not stated"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-2xs font-semibold uppercase tracking-wide text-text-subtle">Device</dt>
                          <dd className="mt-1 inline-flex items-start gap-1.5 text-ink-700">
                            <Laptop className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
                            {candidate.hasLaptop === true
                              ? "Has personal laptop"
                              : candidate.hasLaptop === false
                                ? "Doesn't have a laptop, will require a laptop or desktop to work"
                                : "Not stated"}
                          </dd>
                        </div>
                      </dl>
                    </QuickSection>

                    <QuickSection title="AI Interview Results">
                      <p className="flex items-center gap-2 text-sm">
                        <span
                          className={[
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            candidate.scored ? "bg-success-soft text-success" : "bg-ink-100 text-ink-600",
                          ].join(" ")}
                        >
                          {candidate.scored ? "Completed" : "Pending"}
                        </span>
                        {candidate.scored ? (
                          <span className="tabular-nums text-ink-700">Findtern Score {candidate.score.toFixed(1)}/10</span>
                        ) : null}
                      </p>
                      {candidate.aiFeedbackLink ? (
                        <a
                          href={candidate.aiFeedbackLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="apple-spring apple-pressable mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-4 text-[13px] font-semibold text-brand-800 hover:bg-brand-100"
                        >
                          <FileText className="size-3.5" aria-hidden />
                          View feedback report
                        </a>
                      ) : null}
                    </QuickSection>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Compare Toggle */}
          {comparable ? (
          <Link
            href={compareHref}
            scroll={false}
            // A link, so no aria-pressed: the label carries the state.
            aria-label={selected ? "Remove from compare" : "Add to compare"}
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
          ) : null}

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

function QuickSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-ink-200/70 bg-white p-4 shadow-2xs md:p-5">
      <h3 className="mb-3 text-sm font-semibold text-ink-900 md:text-base">{title}</h3>
      {children}
    </section>
  );
}
