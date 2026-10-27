"use client";

import { useRef } from "react";
import { Download, ExternalLink, FileText, Sparkles, Video } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

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
}: {
  candidateName: string;
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
      <section className="min-w-0 rounded-apple-xl border border-ink-200/80 bg-white p-6 shadow-xs">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-apple-md bg-ink-100 text-ink-600">
            <Sparkles className="size-5" aria-hidden />
          </span>
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
      className="min-w-0 overflow-hidden rounded-apple-xl border border-ink-200/80 bg-white shadow-xs"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            <Sparkles className="size-3.5" aria-hidden />
            AI interview results
          </p>
          <h3 className="mt-1 truncate text-lg font-semibold tracking-[-0.01em] text-ink-900">{candidateName}</h3>
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

      <dl className="grid gap-px bg-ink-100 sm:grid-cols-2 xl:grid-cols-5">
        <div className="bg-brand-50/60 p-5">
          <dt className="text-sm font-medium text-brand-800">Findtern Score</dt>
          <dd className="mt-1 flex items-baseline gap-1">
            <span className="nums text-3xl font-semibold tracking-[-0.02em] text-brand-700">{score !== null ? score.toFixed(1) : "–"}</span>
            <span className="nums text-sm text-ink-500">/10</span>
          </dd>
        </div>
        {AXES.map((axis) => {
          const value = axes.find((a) => a.key === axis.key)?.value ?? null;
          return (
            <div key={axis.key} className="bg-white p-5">
              <dt className="text-sm font-medium text-ink-600">{axis.label}</dt>
              <dd className="mt-1">
                {value !== null ? (
                  <>
                    <span className="flex items-baseline gap-1">
                      <span className="nums text-xl font-semibold text-ink-900">{value.toFixed(1)}</span>
                      <span className="nums text-sm text-ink-500">/10</span>
                    </span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                      <span className="block h-full rounded-full bg-brand-600" style={{ width: `${value * 10}%` }} />
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-ink-500">Not rated</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
