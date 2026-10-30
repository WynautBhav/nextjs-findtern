"use client";

import { useRef } from "react";
import { Download, ExternalLink, FileText, Video } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { LIGHT_TILE } from "@/components/app/primitives";
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
const AXES: { key: keyof AiRatings; label: string }[] = [
  { key: "communication", label: "Communication" },
  { key: "coding", label: "Coding" },
  { key: "aptitude", label: "Aptitude" },
  { key: "interview", label: "AI Interview" },
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
  bio?: string | null;
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
      <section className={cn("min-w-0 rounded-apple-xl border border-ink-200/80 bg-white p-6 shadow-xs", LIGHT_TILE)}>
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink-900">AI interview results pending</h3>
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
      className={cn("min-w-0 overflow-hidden rounded-apple-xl border border-ink-200/80 bg-white shadow-xs", LIGHT_TILE)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 p-5 sm:p-6">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold tracking-[-0.01em] text-ink-900">{heading ?? candidateName}</h3>
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

      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:gap-10">
        <dl>
          <dt className="text-sm font-medium text-brand-800">Findtern Score</dt>
          <dd className="mt-2 flex items-baseline gap-1">
            <span className="nums text-6xl font-medium leading-none tracking-[-0.04em] text-brand-700">{score !== null ? score.toFixed(1) : "–"}</span>
            <span className="nums text-base text-text-subtle">/10</span>
          </dd>
        </dl>

        {/* Every part on one shared 0–10 scale, so they compare at a glance. */}
        <ScoreScale rows={AXES.map((axis) => ({ label: axis.label, value: axes.find((a) => a.key === axis.key)?.value ?? null }))} />
      </div>
    </section>
  );
}
