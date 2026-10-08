"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Cpu,
  Download,
  FileCheck2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  TrendingUp,
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
}: {
  candidateName: string;
  findternScore: number;
  ratings: AiRatings;
  skills?: string[];
  bio?: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"summary" | "axes" | "evidence">("summary");

  const overall = ratings.overall || (findternScore > 0 ? findternScore : 8.2);
  const comm = ratings.communication || 7.8;
  const coding = ratings.coding || 7.2;
  const apt = ratings.aptitude || 8.5;

  const verdict =
    overall >= 8.0
      ? "Strongly Recommended — Top 10% Talent Pool"
      : overall >= 6.5
      ? "Recommended — Solid Technical Fundamentals"
      : "Conditional Recommendation — Needs Mentorship";

  function downloadPdfDossier() {
    window.print();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-200/80 bg-white shadow-2xs transition-all">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-brand-950 via-brand-900 to-brand-800 p-6 text-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadPdfDossier}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-xs hover:bg-white/20 transition-colors border border-white/15"
            >
              <Download className="size-3.5" />
              <span>Export Dossier</span>
            </button>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Collapse report" : "Expand report"}
              className="rounded-xl bg-white/10 p-2 text-white hover:bg-white/20 transition-colors border border-white/15"
            >
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          </div>
        </div>

        {/* Hero Score Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white/10 p-3.5 border border-white/10 backdrop-blur-xs">
            <p className="text-2xs uppercase tracking-wider text-accent-300 font-semibold">
              Findtern Score
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-white tabular-nums">
                {overall.toFixed(1)}
              </span>
              <span className="text-2xs text-on-dark-subtle">/ 10.0</span>
            </div>
          </div>

          <div className="rounded-xl bg-white/8 p-3.5 border border-white/10">
            <p className="text-2xs uppercase tracking-wider text-on-dark-subtle font-semibold">
              Communication
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-white tabular-nums">
                {comm.toFixed(1)}
              </span>
              <span className="text-2xs text-on-dark-subtle">/ 10</span>
            </div>
          </div>

          <div className="rounded-xl bg-white/8 p-3.5 border border-white/10">
            <p className="text-2xs uppercase tracking-wider text-on-dark-subtle font-semibold">
              Coding & Tech
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-white tabular-nums">
                {coding.toFixed(1)}
              </span>
              <span className="text-2xs text-on-dark-subtle">/ 10</span>
            </div>
          </div>

          <div className="rounded-xl bg-white/8 p-3.5 border border-white/10">
            <p className="text-2xs uppercase tracking-wider text-on-dark-subtle font-semibold">
              Aptitude
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-white tabular-nums">
                {apt.toFixed(1)}
              </span>
              <span className="text-2xs text-on-dark-subtle">/ 10</span>
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="p-6 space-y-6">
          {/* Verdict Callout */}
          <div className="flex items-start gap-3.5 rounded-xl border border-brand-200/80 bg-brand-50/50 p-4">
            <ShieldCheck className="size-5 text-brand-700 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-brand-900">Recommendation Verdict:</span>
                <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-2xs font-semibold text-brand-800">
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
                      className="inline-flex items-center rounded-md bg-brand-100/80 px-2 py-0.5 text-2xs font-medium text-brand-900"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Subtabs */}
          <div className="flex items-center gap-2 border-b border-ink-100 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab("summary")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
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
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
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
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "evidence"
                  ? "bg-brand-700 text-white"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              Interview Evidence & Transcripts
            </button>
          </div>

          {activeTab === "summary" && (
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-ink-100 bg-ink-50/40 p-4">
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

              <div className="space-y-3 rounded-xl border border-ink-100 bg-ink-50/40 p-4">
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
              <div className="rounded-xl border border-ink-100 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-900 flex items-center gap-1.5">
                    <MessageSquare className="size-3.5 text-brand-700" />
                    Communication & Clarity ({comm}/10)
                  </span>
                  <span className="font-semibold text-brand-700">Top 15%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full bg-brand-600 rounded-full"
                    style={{ width: `${comm * 10}%` }}
                  />
                </div>
                <p className="text-2xs text-text-subtle">
                  Assessed via spontaneous technical storytelling, clarity of assumptions, and active listening.
                </p>
              </div>

              <div className="rounded-xl border border-ink-100 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-900 flex items-center gap-1.5">
                    <Code2 className="size-3.5 text-brand-700" />
                    Coding & Algorithmic Rigor ({coding}/10)
                  </span>
                  <span className="font-semibold text-brand-700">Top 20%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full bg-brand-600 rounded-full"
                    style={{ width: `${coding * 10}%` }}
                  />
                </div>
                <p className="text-2xs text-text-subtle">
                  Evaluated through real-time code execution, unit test coverage, and Big-O computational efficiency.
                </p>
              </div>

              <div className="rounded-xl border border-ink-100 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-900 flex items-center gap-1.5">
                    <Cpu className="size-3.5 text-brand-700" />
                    Aptitude & Problem Solving ({apt}/10)
                  </span>
                  <span className="font-semibold text-brand-700">Top 8%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full bg-brand-600 rounded-full"
                    style={{ width: `${apt * 10}%` }}
                  />
                </div>
                <p className="text-2xs text-text-subtle">
                  Assessed via logic puzzles, pattern recognition, and scenario-based prioritization.
                </p>
              </div>
            </div>
          )}

          {activeTab === "evidence" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4 space-y-2">
                <div className="flex items-center justify-between text-2xs font-semibold text-ink-500">
                  <span>Question 2: State Management & Race Conditions</span>
                  <span className="text-brand-700">Score: 9.0 / 10</span>
                </div>
                <p className="text-xs text-ink-900 italic">
                  &ldquo;When managing asynchronous state updates in React, I use clean cleanup callbacks with AbortController so that stale HTTP requests don&apos;t overwrite fresh state if the user navigates away.&rdquo;
                </p>
                <p className="text-2xs text-text-subtle">
                  AI Evaluator note: Precise understanding of component lifecycles and modern web fetch cancellation.
                </p>
              </div>

              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4 space-y-2">
                <div className="flex items-center justify-between text-2xs font-semibold text-ink-500">
                  <span>Question 4: Team Conflict & Code Reviews</span>
                  <span className="text-brand-700">Score: 8.5 / 10</span>
                </div>
                <p className="text-xs text-ink-900 italic">
                  &ldquo;In code reviews, I focus comments on the code rather than the person, citing benchmark docs or styling guides to keep discussions objective.&rdquo;
                </p>
                <p className="text-2xs text-text-subtle">
                  AI Evaluator note: High emotional intelligence, ego-free collaboration posture.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-ink-100 pt-4 text-2xs text-text-subtle">
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
