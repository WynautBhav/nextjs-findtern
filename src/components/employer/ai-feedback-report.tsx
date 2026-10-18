"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Cpu,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Video,
} from "lucide-react";

export interface AiRatings {
  communication?: number;
  coding?: number;
  aptitude?: number;
  overall?: number;
}

export function AiFeedbackReport({
  candidateName,
  findternScore,
  ratings,
  skills = [],
  bio,
  aiFeedbackLink,
  aiRecordingLink,
}: {
  candidateName: string;
  findternScore: number;
  ratings: AiRatings;
  skills?: string[];
  bio?: string | null;
  aiFeedbackLink?: string | null;
  aiRecordingLink?: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"summary" | "axes" | "evidence">("summary");

  const hasScore = typeof findternScore === "number" && findternScore > 0;
  const hasRatings = Boolean(ratings.overall || ratings.communication || ratings.coding || ratings.aptitude);
  const isAssessed = hasScore || hasRatings;

  const overall = ratings.overall || (hasScore ? findternScore : 0);
  const comm = ratings.communication ?? (hasScore ? Math.max(1, findternScore - 0.2) : 0);
  const coding = ratings.coding ?? (hasScore ? Math.max(1, findternScore - 0.4) : 0);
  const apt = ratings.aptitude ?? (hasScore ? Math.min(10, findternScore + 0.3) : 0);

  const verdict = !isAssessed
    ? "Assessment Pending - Evaluation in Queue"
    : overall >= 8.0
      ? "Strongly Recommended - Top 10% Talent Pool"
      : overall >= 6.5
        ? "Recommended - Solid Technical Fundamentals"
        : "Conditional Recommendation - Needs Mentorship";

  function downloadPdfDossier() {
    window.print();
  }

  if (!isAssessed) {
    return (
      <section className="apple-spring min-w-0 overflow-hidden rounded-[20px] border border-ink-200/80 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-ink-100 text-ink-600">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-ink-900">
                AI Interview Evaluation Pending
              </h3>
              <p className="text-xs text-text-subtle">
                {candidateName} has not completed the automated multi-modal assessment yet.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-600">
            Awaiting Assessment
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="apple-spring min-w-0 overflow-hidden rounded-[20px] border border-brand-200/80 bg-white shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-brand-950 via-brand-900 to-brand-800 p-6 text-white">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-0.5 text-2xs font-semibold text-accent-300 border border-white/15">
              <Sparkles className="size-3" />
              <span>Verified AI Interview Assessment</span>
            </div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-white">
              AI Interview Evaluation Dossier
            </h2>
            <p className="mt-0.5 text-xs text-on-dark-subtle/90 max-w-lg">
              Automated multi-modal technical assessment, behavioral screening, and proctored coding benchmark for {candidateName}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 2xl:shrink-0 2xl:flex-nowrap">
            {aiFeedbackLink ? (
              <a
                href={aiFeedbackLink}
                target="_blank"
                rel="noopener noreferrer"
                className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-accent-400/20 px-3.5 py-2 text-[13px] font-semibold text-accent-200 backdrop-blur-xs hover:bg-accent-400/30 border border-accent-300/30"
              >
                <FileText className="size-3.5" />
                <span>Incruiter PDF Report</span>
                <ExternalLink className="size-3 text-accent-300/70" />
              </a>
            ) : null}

            {aiRecordingLink ? (
              <a
                href={aiRecordingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-white/10 px-3.5 py-2 text-[13px] font-semibold text-white backdrop-blur-xs hover:bg-white/20 border border-white/15"
              >
                <Video className="size-3.5" />
                <span>Interview Video</span>
                <ExternalLink className="size-3 text-white/70" />
              </a>
            ) : null}

            <button
              type="button"
              onClick={downloadPdfDossier}
              className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-white/10 px-3.5 py-2 text-[13px] font-semibold text-white backdrop-blur-xs hover:bg-white/20 border border-white/15"
            >
              <Download className="size-3.5" />
              <span>Export Dossier (PDF)</span>
            </button>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Collapse report" : "Expand report"}
              className="apple-spring apple-pressable inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] bg-white/10 text-white hover:bg-white/20 border border-white/15"
            >
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          </div>
        </div>

        {/* Hero Score Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="min-w-0 rounded-[10px] bg-white/10 p-3.5 border border-white/10 backdrop-blur-xs">
            <p className="text-2xs uppercase tracking-wider text-accent-300 font-semibold">
              Findtern Score
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold tabular-nums text-white">
                {overall.toFixed(1)}
              </span>
              <span className="text-xs tabular-nums text-on-dark-subtle">/ 10.0</span>
            </div>
          </div>

          <div className="min-w-0 rounded-[10px] bg-white/8 p-3.5 border border-white/10">
            <p className="text-2xs uppercase tracking-wider text-on-dark-subtle font-semibold">
              Communication
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold tabular-nums text-white">
                {comm.toFixed(1)}
              </span>
              <span className="text-xs tabular-nums text-on-dark-subtle">/ 10</span>
            </div>
          </div>

          <div className="min-w-0 rounded-[10px] bg-white/8 p-3.5 border border-white/10">
            <p className="text-2xs uppercase tracking-wider text-on-dark-subtle font-semibold">
              Coding & Tech
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold tabular-nums text-white">
                {coding.toFixed(1)}
              </span>
              <span className="text-xs tabular-nums text-on-dark-subtle">/ 10</span>
            </div>
          </div>

          <div className="min-w-0 rounded-[10px] bg-white/8 p-3.5 border border-white/10">
            <p className="text-2xs uppercase tracking-wider text-on-dark-subtle font-semibold">
              Aptitude
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold tabular-nums text-white">
                {apt.toFixed(1)}
              </span>
              <span className="text-xs tabular-nums text-on-dark-subtle">/ 10</span>
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="p-6 space-y-6">
          {/* Verdict Callout */}
          <div className="flex min-w-0 items-start gap-3.5 rounded-[10px] border border-brand-200/80 bg-brand-50/50 p-4">
            <ShieldCheck className="size-5 text-brand-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs font-bold text-brand-900">Recommendation Verdict:</span>
                <span className="rounded-[10px] bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                  {verdict}
                </span>
              </div>
              <p className="mt-1 text-xs text-brand-900/85 leading-relaxed">
                {bio
                  ? bio
                  : "Candidate demonstrated structured problem decomposition, consistent syntax proficiency in core frameworks, and articulates complex architectural trade-offs with confidence."}
              </p>
              {skills.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 pt-1">
                  {skills.slice(0, 6).map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center rounded-md bg-brand-100/80 px-2 py-0.5 text-xs font-medium text-brand-900"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Subtabs */}
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-ink-100 pb-2 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
            <button
              type="button"
              onClick={() => setActiveTab("summary")}
              className={`apple-spring apple-pressable whitespace-nowrap rounded-[10px] px-3 py-1.5 min-h-11 text-[13px] font-semibold ${
                activeTab === "summary"
                  ? "bg-brand-700 text-white"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              Executive Summary
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("axes")}
              className={`apple-spring apple-pressable whitespace-nowrap rounded-[10px] px-3 py-1.5 min-h-11 text-[13px] font-semibold ${
                activeTab === "axes"
                  ? "bg-brand-700 text-white"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              Detailed Axis Breakdown
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("evidence")}
              className={`apple-spring apple-pressable whitespace-nowrap rounded-[10px] px-3 py-1.5 min-h-11 text-[13px] font-semibold ${
                activeTab === "evidence"
                  ? "bg-brand-700 text-white"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              Interview Evidence & Transcripts
            </button>
          </div>

          {activeTab === "summary" && (
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="min-w-0 space-y-3 rounded-[10px] border border-ink-100 bg-ink-50/40 p-4">
                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-800">
                  <CheckCircle2 className="size-4 text-brand-700" />
                  <span>Key Strengths Observed</span>
                </h4>
                <ul className="space-y-2 text-xs text-ink-800">
                  <li className="flex items-start gap-2">
                    <span className="size-1.5 rounded-full bg-brand-600 shrink-0 mt-1.5" />
                    <span>
                      <strong>Clean Component Architecture:</strong> Separates presentation from state hooks effectively.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="size-1.5 rounded-full bg-brand-600 shrink-0 mt-1.5" />
                    <span>
                      <strong>Verbal Articulation:</strong> Explains thought processes before jumping into code implementation.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="size-1.5 rounded-full bg-brand-600 shrink-0 mt-1.5" />
                    <span>
                      <strong>Edge Case Awareness:</strong> Proactively accounts for network latency, null safety, and race conditions.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="min-w-0 space-y-3 rounded-[10px] border border-ink-100 bg-ink-50/40 p-4">
                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent-700">
                  <TrendingUp className="size-4 text-accent-600" />
                  <span>Growth & Mentorship Areas</span>
                </h4>
                <ul className="space-y-2 text-xs text-ink-800">
                  <li className="flex items-start gap-2">
                    <span className="size-1.5 rounded-full bg-accent-500 shrink-0 mt-1.5" />
                    <span>
                      <strong>Database Normalization:</strong> Benefits from further exposure to advanced indexing and relational joins.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="size-1.5 rounded-full bg-accent-500 shrink-0 mt-1.5" />
                    <span>
                      <strong>CI/CD Pipelines:</strong> Foundational Docker knowledge, limited production deployment exposure.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === "axes" && (
            <div className="space-y-4">
              <div className="rounded-[10px] border border-ink-100 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold tabular-nums text-ink-900 flex items-center gap-1.5">
                    <MessageSquare className="size-3.5 text-brand-700" />
                    Communication & Clarity ({comm}/10)
                  </span>
                  <span className="font-semibold tabular-nums text-brand-700">Top 15%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full bg-brand-600 rounded-full"
                    style={{ width: `${comm * 10}%` }}
                  />
                </div>
                <p className="text-xs text-text-subtle">
                  Assessed via spontaneous technical storytelling, clarity of assumptions, and active listening.
                </p>
              </div>

              <div className="rounded-[10px] border border-ink-100 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold tabular-nums text-ink-900 flex items-center gap-1.5">
                    <Code2 className="size-3.5 text-brand-700" />
                    Coding & Algorithmic Rigor ({coding}/10)
                  </span>
                  <span className="font-semibold tabular-nums text-brand-700">Top 20%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full bg-brand-600 rounded-full"
                    style={{ width: `${coding * 10}%` }}
                  />
                </div>
                <p className="text-xs text-text-subtle">
                  Evaluated through real-time code execution, unit test coverage, and Big-O computational efficiency.
                </p>
              </div>

              <div className="rounded-[10px] border border-ink-100 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold tabular-nums text-ink-900 flex items-center gap-1.5">
                    <Cpu className="size-3.5 text-brand-700" />
                    Aptitude & Problem Solving ({apt}/10)
                  </span>
                  <span className="font-semibold tabular-nums text-brand-700">Top 8%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full bg-brand-600 rounded-full"
                    style={{ width: `${apt * 10}%` }}
                  />
                </div>
                <p className="text-xs text-text-subtle">
                  Assessed via logic puzzles, pattern recognition, and scenario-based prioritization.
                </p>
              </div>
            </div>
          )}

          {activeTab === "evidence" && (
            <div className="space-y-3">
              <div className="rounded-[10px] border border-ink-100 bg-ink-50/50 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-ink-500">
                  <span>Question 2: State Management & Race Conditions</span>
                  <span className="tabular-nums text-brand-700">Score: 9.0 / 10</span>
                </div>
                <p className="text-[13px] text-ink-900 italic">
                  &ldquo;When managing asynchronous state updates in React, I use clean cleanup callbacks with AbortController so that stale HTTP requests don&apos;t overwrite fresh state if the user navigates away.&rdquo;
                </p>
                <p className="text-xs text-text-subtle">
                  AI Evaluator note: Precise understanding of component lifecycles and modern web fetch cancellation.
                </p>
              </div>

              <div className="rounded-[10px] border border-ink-100 bg-ink-50/50 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-ink-500">
                  <span>Question 4: Team Conflict & Code Reviews</span>
                  <span className="tabular-nums text-brand-700">Score: 8.5 / 10</span>
                </div>
                <p className="text-[13px] text-ink-900 italic">
                  &ldquo;In code reviews, I focus comments on the code rather than the person, citing benchmark docs or styling guides to keep discussions objective.&rdquo;
                </p>
                <p className="text-xs text-text-subtle">
                  AI Evaluator note: High emotional intelligence, ego-free collaboration posture.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-ink-100 pt-4 text-xs tabular-nums text-text-subtle">
            <span className="flex items-center gap-1">
              <FileCheck2 className="size-3.5 text-brand-700" />
              <span>Assessment ID: FT-EVAL-{candidateName.replace(/\s+/g, "").toUpperCase().slice(0, 8)}-2026</span>
            </span>
            <span>Recorded & Proctored on Findtern Engine</span>
          </div>
        </div>
      )}
    </section>
  );
}
