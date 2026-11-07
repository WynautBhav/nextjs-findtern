"use client";

import { useRef } from "react";
import { Download, ExternalLink, FileText, Video } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { SURFACE_CLASS } from "@/components/app/primitives";
import { ScoreScale } from "@/components/app/tiles";
import { cn } from "@/lib/utils";

export interface AiRatings {
  communication?: number;
  coding?: number;
  aptitude?: number;
  /** The AI interview's own rating (legacy `ratings.interview`). */
  interview?: number;
}

/** Labels and order as the legacy profile printed them (ProfileResume ratingEntries). */
const AXES: { key: keyof AiRatings; label: string; hint: string }[] = [
  { key: "communication", hint: "How clearly they explain their thinking and answer in conversation.", label: "Communication" },
  { key: "coding", hint: "How well they solve and write code in a timed task.", label: "Coding" },
  { key: "aptitude", hint: "Logic and problem solving on structured questions.", label: "Aptitude" },
  { key: "interview", hint: "The AI interviewer's overall rating of the full conversation.", label: "AI interview" },
];

/** Ratings are out of 10; anything else stored is shown as not rated. */
function rated(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(10, value) : null;
}

/**
 * The AI interview result: the Findtern Score and each rated axis, exactly as
 * stored - nothing is estimated or filled in. Shared by the employer's
 * candidate views and the intern's own interviews page.
 */
export function AiFeedbackReport({
  candidateName,
  findternScore,
  ratings,
  aiFeedbackLink,
  aiRecordingLink,
  heading,
}: {
  candidateName: string;
  /** The report's title; the candidate's name by default (the intern's own page says "Your scores"). */
  heading?: string;
  findternScore: number;
  ratings: AiRatings;
  /** Kept for callers; the report shows only the scores. */
  skills?: string[];
  aiFeedbackLink?: string | null;
  aiRecordingLink?: string | null;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const score = rated(findternScore);
  const axes = AXES.map((a) => ({ ...a, value: rated(ratings[a.key]) })).filter(
    (a): a is typeof a & { value: number } => a.value !== null,
  );
  const assessed = score !== null || axes.length > 0;
  const byValue = [...axes].sort((a, b) => b.value - a.value);
  const strongest = byValue[0];
  const weakest = byValue[byValue.length - 1];

  /**
   * Print this report only. A page can render several (one per candidate
   * card), and a bare window.print() printed all of them.
   */
  function printReport() {
    const el = sectionRef.current;
    if (!el) {
      window.print();
      return;
    }
    const root = document.createElement("div");
    root.id = "print-root";
    root.innerHTML = el.outerHTML;
    document.body.appendChild(root);
    document.body.classList.add("printing-one");
    const cleanup = () => {
      root.remove();
      document.body.classList.remove("printing-one");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  if (!assessed) {
    return (
      <section className={cn("min-w-0 p-6", SURFACE_CLASS)}>
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900">AI interview results pending</h2>
            <p className="mt-0.5 text-sm text-ink-600">
              {candidateName} has no AI interview score yet. Scores appear here once the interview is reviewed.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      className={cn("min-w-0 overflow-hidden", SURFACE_CLASS)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 p-5 sm:p-6">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold text-ink-900">{heading ?? candidateName}</h2>
          {strongest ? (
            <p className="mt-1 text-sm text-ink-600">
              AI interview. Strongest in {strongest.label}, <span className="nums">{strongest.value.toFixed(1)}</span>
              {weakest && weakest.key !== strongest.key ? (
                <>
                  ; lowest in {weakest.label}, <span className="nums">{weakest.value.toFixed(1)}</span>
                </>
              ) : null}
              .
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-600">AI interview results</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {aiFeedbackLink ? (
            <a
              href={aiFeedbackLink}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-10" })}
            >
              <FileText className="size-4" aria-hidden />
              Feedback report
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
          {aiRecordingLink ? (
            <a
              href={aiRecordingLink}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-10" })}
            >
              <Video className="size-4" aria-hidden />
              Recording
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
          <button
            type="button"
            onClick={printReport}
            className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-10" })}
          >
            <Download className="size-4" aria-hidden />
            Save as PDF
          </button>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <p className="flex items-baseline gap-2 text-sm text-ink-700">
          <span className="font-medium">Findtern Score</span>
          <span className="nums text-2xl font-semibold text-brand-700">{score !== null ? score.toFixed(1) : "–"}</span>
          <span className="nums text-text-subtle">out of 10</span>
        </p>
        {/* Every part on one shared 0–10 scale, so they compare at a glance. */}
        <ScoreScale rows={AXES.map((axis) => ({ label: axis.label, value: axes.find((a) => a.key === axis.key)?.value ?? null }))} />
        <details className="group border-t border-ink-100 pt-4 print:hidden">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
            What these scores mean
          </summary>
          <dl className="mt-2 space-y-2 text-sm text-ink-700">
            {AXES.map((axis) => (
              <div key={axis.key}>
                <dt className="inline font-medium text-ink-900">{axis.label}: </dt>
                <dd className="inline">{axis.hint}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </section>
  );
}
