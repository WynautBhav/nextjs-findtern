"use client";

import { useRef } from "react";
import { Download, ExternalLink, FileText, Sparkles, Video } from "lucide-react";

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
      <section className="min-w-0 rounded-[20px] border border-ink-200/80 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-600">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink-900">AI interview results pending</h3>
            <p className="mt-0.5 text-sm text-text-subtle">
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
      className="min-w-0 overflow-hidden rounded-[20px] border border-ink-200/80 bg-white shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            <Sparkles className="size-3.5" aria-hidden />
            AI interview results
          </p>
          <h3 className="mt-1 truncate text-base font-semibold tracking-[-0.01em] text-ink-900">{candidateName}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {aiFeedbackLink ? (
            <a
              href={aiFeedbackLink}
              target="_blank"
              rel="noopener noreferrer"
              className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-brand-200 bg-brand-50 px-3.5 text-[13px] font-semibold text-brand-800 hover:bg-brand-100"
            >
              <FileText className="size-3.5" aria-hidden />
              View feedback report
              <ExternalLink className="size-3 text-brand-600" aria-hidden />
            </a>
          ) : null}
          {aiRecordingLink ? (
            <a
              href={aiRecordingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[13px] font-semibold text-ink-700 hover:bg-ink-50"
            >
              <Video className="size-3.5" aria-hidden />
              Interview recording
              <ExternalLink className="size-3 text-ink-400" aria-hidden />
            </a>
          ) : null}
          <button
            type="button"
            onClick={printReport}
            className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[13px] font-semibold text-ink-700 hover:bg-ink-50"
          >
            <Download className="size-3.5" aria-hidden />
            Save as PDF
          </button>
        </div>
      </div>

      <dl className="grid gap-px bg-ink-100 sm:grid-cols-2 xl:grid-cols-5">
        <div className="bg-brand-50/60 p-5">
          <dt className="text-xs font-semibold text-brand-800">Findtern Score</dt>
          <dd className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-bold tabular-nums text-ink-900">{score !== null ? score.toFixed(1) : "–"}</span>
            <span className="text-xs tabular-nums text-text-subtle">/ 10</span>
          </dd>
        </div>
        {AXES.map((axis) => {
          const value = axes.find((a) => a.key === axis.key)?.value ?? null;
          return (
            <div key={axis.key} className="bg-white p-5">
              <dt className="text-xs font-semibold text-ink-700">{axis.label}</dt>
              <dd className="mt-1">
                {value !== null ? (
                  <>
                    <span className="flex items-baseline gap-1">
                      <span className="text-xl font-semibold tabular-nums text-ink-900">{value.toFixed(1)}</span>
                      <span className="text-xs tabular-nums text-text-subtle">/ 10</span>
                    </span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                      <span className="block h-full rounded-full bg-brand-600" style={{ width: `${value * 10}%` }} />
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-text-subtle">Not rated</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
