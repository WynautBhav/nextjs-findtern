"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  Eye,
  ExternalLink,
  GraduationCap,
  Laptop,
  MapPin,
  Scale,
  Send,
  Sparkles,
} from "lucide-react";

import { bandFor } from "@/lib/score";
import { formatRate } from "@/lib/format";
import {
  RATING_META,
  type CandidateProfile,
} from "@/lib/employer-candidates";
import { resolvePricing, type Currency } from "@/lib/employer-pricing";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { AiFeedbackReport } from "@/components/employer/ai-feedback-report";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";

export interface CandidateCardProps {
  candidate: CandidateProfile;
  currency: Currency;
  region: "IN" | null;
  selected: boolean;
  compareHref: string;
  projectId: string | null;
  shortlisted: boolean;
}

export function CandidateCard({
  candidate,
  currency,
  region,
  selected,
  compareHref,
  projectId,
  shortlisted,
}: CandidateCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const band = bandFor(candidate.score);
  const pricing = resolvePricing(candidate.score, [], currency, region);
  const assessed = RATING_META.filter((meta) => candidate.ratings[meta.key] > 0);

  return (
    <li className="group relative flex flex-col justify-between rounded-2xl border border-sand-300 bg-white p-5 shadow-2xs transition-all duration-200 hover:border-brand-400 hover:shadow-md hover:-translate-y-0.5">
      <div>
        {/* Top Header: Avatar + Identity + Hero Score Gauge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            {/* Avatar Initials with Tier Ring */}
            <div className="relative shrink-0">
              <span
                aria-hidden
                className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 font-bold text-brand-800 shadow-2xs text-base border border-brand-200/80"
              >
                {candidate.initials}
              </span>
              {candidate.scored && candidate.score >= 8.0 ? (
                <span
                  title="Top Tier Findtern Assessed"
                  className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-brand-700 text-white ring-2 ring-white shadow-2xs"
                >
                  <Sparkles className="size-2.5" />
                </span>
              ) : null}
            </div>

            {/* Candidate Name, Band & Metadata */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="text-left font-semibold text-ink-900 transition-colors hover:text-brand-700 line-clamp-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xs"
                >
                  {candidate.fullName}
                </button>
                <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-2xs font-semibold text-brand-700 border border-brand-200/60">
                  {band.name}
                </span>
              </div>

              {/* Location, Work Modes & Hardware */}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-subtle">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5 shrink-0 text-ink-400" />
                  <span className="truncate">{candidate.location || "Location not stated"}</span>
                </span>
                {candidate.workModes.length > 0 ? (
                  <>
                    <span className="text-sand-400">·</span>
                    <span className="capitalize">{candidate.workModes.join(", ")}</span>
                  </>
                ) : null}
                {candidate.hasLaptop ? (
                  <>
                    <span className="text-sand-400">·</span>
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium text-2xs">
                      <Laptop className="size-3" />
                      Laptop Ready
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Hero Score & Rate Pill */}
          <div className="shrink-0 text-right">
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-brand-900 px-3 py-1 text-white shadow-2xs">
              <span className="text-2xs font-semibold uppercase tracking-wider text-accent-300">
                Score
              </span>
              <span className="text-base font-bold tabular-nums text-white">
                {candidate.scored ? candidate.score.toFixed(1) : "—"}
              </span>
              {candidate.scored ? (
                <span className="text-3xs text-white/70">/10</span>
              ) : null}
            </div>
            <p className="mt-1 text-xs font-bold tabular-nums text-brand-700">
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

        {/* Skills Chips */}
        {candidate.skills.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {candidate.skills.slice(0, 5).map((skill) => (
              <li
                key={skill}
                className="rounded-md bg-sand-100/70 px-2 py-0.5 text-2xs font-medium text-ink-800 border border-sand-200/80 transition-colors hover:border-brand-300 hover:bg-brand-50/50"
              >
                {skill}
              </li>
            ))}
            {candidate.skills.length > 5 ? (
              <li className="rounded-md bg-sand-100/70 px-2 py-0.5 text-2xs font-medium text-ink-500 border border-sand-200/80">
                +{candidate.skills.length - 5} more
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-ink-400 italic">No skills listed yet.</p>
        )}

        {/* 4-Axis Technical Assessment Gauges */}
        {assessed.length > 0 ? (
          <div className="mt-3.5 grid grid-cols-2 gap-2 rounded-xl bg-sand-50/80 p-2.5 sm:grid-cols-4 border border-sand-200/60">
            {assessed.map((meta) => {
              const val = candidate.ratings[meta.key];
              const pct = Math.min(100, (val / 10) * 100);
              return (
                <div key={meta.key} className="flex flex-col">
                  <div className="flex items-center justify-between text-3xs font-semibold uppercase tracking-wider text-text-subtle">
                    <span>{meta.label}</span>
                    <span className="text-xs font-bold tabular-nums text-ink-900">
                      {val.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-sand-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-600 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Card Action Deck */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-sand-200/80 pt-3">
        {/* Left: Quick View & Compare */}
        <div className="flex items-center gap-1.5">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-2.5 text-xs font-medium text-ink-700 transition hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-800"
              >
                <Eye className="size-3.5 text-ink-500" aria-hidden />
                <span>Quick View</span>
              </button>
            </SheetTrigger>

            <SheetContent
              side="right"
              className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto p-0 border-l border-sand-200 bg-surface-alt"
            >
              <div className="p-6">
                <SheetHeader className="text-left pb-4 border-b border-sand-200">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-lg font-bold text-brand-800 border border-brand-200">
                        {candidate.initials}
                      </span>
                      <div>
                        <SheetTitle className="text-xl font-bold text-ink-900">
                          {candidate.fullName}
                        </SheetTitle>
                        <SheetDescription className="mt-0.5 text-xs text-text-subtle">
                          {candidate.location || "Location not stated"}
                          {candidate.workModes.length > 0
                            ? ` · ${candidate.workModes.join(", ")}`
                            : ""}
                        </SheetDescription>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-2xs font-semibold text-brand-700 border border-brand-200">
                            {band.name}
                          </span>
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
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 border border-sand-200 shadow-2xs">
                  <Link
                    href={`/employer/send-proposal?intern=${encodeURIComponent(candidate.id)}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white transition hover:bg-brand-800"
                  >
                    <Send className="size-3.5" />
                    <span>Send Proposal</span>
                  </Link>
                  {projectId ? (
                    <ShortlistToggle
                      internId={candidate.id}
                      projectId={projectId}
                      shortlisted={shortlisted}
                      size="sm"
                    />
                  ) : null}
                  <Link
                    href={`/employer/intern/${encodeURIComponent(candidate.id)}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-3 text-xs font-medium text-ink-700 transition hover:bg-sand-50 ml-auto"
                  >
                    <span>Full Profile</span>
                    <ExternalLink className="size-3.5 text-ink-400" />
                  </Link>
                </div>

                {/* Candidate bio */}
                {candidate.bio ? (
                  <div className="mt-5 rounded-xl border border-sand-200 bg-white p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
                      About Candidate
                    </h4>
                    <p className="mt-2 text-xs leading-relaxed text-ink-700 whitespace-pre-wrap">
                      {candidate.bio}
                    </p>
                  </div>
                ) : null}

                {/* Academics & Hardware */}
                {candidate.academics ? (
                  <div className="mt-4 rounded-xl border border-sand-200 bg-white p-4">
                    <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-subtle">
                      <GraduationCap className="size-4 text-brand-600" />
                      Academic Background
                    </h4>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
                      <div>
                        <span className="text-text-subtle block">Institution</span>
                        <span className="font-semibold text-ink-900">
                          {candidate.academics.institution || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-subtle block">Degree</span>
                        <span className="font-semibold text-ink-900">
                          {[candidate.academics.degree, candidate.academics.specialization]
                            .filter(Boolean)
                            .join(" - ") || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-subtle block">Score / CGPA</span>
                        <span className="font-semibold tabular-nums text-ink-900">
                          {candidate.academics.score
                            ? `${candidate.academics.score} ${candidate.academics.scoreType || ""}`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-subtle block">Hardware</span>
                        <span className="font-semibold text-ink-900 inline-flex items-center gap-1">
                          <Laptop className="size-3.5 text-ink-500" />
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
                  <div className="mt-4 rounded-xl border border-sand-200 bg-white p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
                      Verified Skills ({candidate.skills.length})
                    </h4>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {candidate.skills.map((skill) => (
                        <li
                          key={skill}
                          className="rounded-lg bg-sand-100 px-2.5 py-1 text-xs font-medium text-ink-800 border border-sand-200"
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
                    candidateName={candidate.fullName}
                    findternScore={candidate.score}
                    ratings={{
                      communication: candidate.ratings.communication,
                      coding: candidate.ratings.coding,
                      aptitude: candidate.ratings.aptitude,
                      overall: candidate.score,
                    }}
                    skills={candidate.skills}
                    bio={candidate.bio}
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Compare Toggle */}
          <Link
            href={compareHref}
            aria-pressed={selected}
            className={[
              "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition",
              selected
                ? "border-brand-600 bg-brand-50 text-brand-700 font-semibold"
                : "border-sand-300 bg-white text-ink-700 hover:bg-sand-50",
            ].join(" ")}
          >
            {selected ? (
              <Check className="size-3.5 text-brand-600" aria-hidden />
            ) : (
              <Scale className="size-3.5 text-ink-400" aria-hidden />
            )}
            <span>{selected ? "Selected" : "Compare"}</span>
          </Link>
        </div>

        {/* Right: Shortlist & Send Proposal */}
        <div className="flex items-center gap-1.5">
          {projectId ? (
            <ShortlistToggle
              internId={candidate.id}
              projectId={projectId}
              shortlisted={shortlisted}
              size="sm"
            />
          ) : null}

          <Link
            href={`/employer/send-proposal?intern=${encodeURIComponent(candidate.id)}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-xs font-semibold text-white shadow-2xs transition hover:bg-brand-800"
          >
            <Send className="size-3.5" aria-hidden />
            <span>Send proposal</span>
          </Link>
        </div>
      </div>
    </li>
  );
}
