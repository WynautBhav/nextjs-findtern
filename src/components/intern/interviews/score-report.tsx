import { ExternalLink, FileText, Video } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

import { PrintReportButton } from "./print-report-button";

/** Labels and order as the legacy profile printed them (same as the employer's AiFeedbackReport). */
const AXES = [
  { key: "communication", label: "Communication" },
  { key: "coding", label: "Coding" },
  { key: "aptitude", label: "Aptitude" },
  { key: "interview", label: "AI Interview" },
] as const;

export type Ratings = Partial<Record<(typeof AXES)[number]["key"], number>>;

/** Ratings are out of 10; anything else stored is shown as not rated. */
function rated(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(10, v) : null;
}

/**
 * The intern's own score report: the Findtern Score as one large figure, and the four axes it averages as a
 * ruled list with a bar each. Same stored numbers the employer sees, nothing estimated. No band name:
 * interns are never shown the pricing bands.
 */
export function ScoreReport({
  findternScore,
  ratings,
  feedbackLink,
  recordingLink,
}: {
  findternScore: number;
  ratings: Ratings;
  feedbackLink?: string | null;
  recordingLink?: string | null;
}) {
  const score = rated(findternScore);
  const axes = AXES.map((a) => ({ ...a, value: rated(Number(ratings[a.key])) }));
  const scored = axes.filter((a): a is typeof a & { value: number } => a.value !== null).sort((a, b) => b.value - a.value);
  const strongest = scored[0];
  const weakest = scored.length > 1 ? scored[scored.length - 1] : undefined;

  return (
    <section aria-labelledby="score-title" className="grid gap-x-12 gap-y-6 border-t border-ink-300 pt-6 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <h2 id="score-title" className="font-display text-lg font-semibold text-ink-900">
          Your Findtern Score
        </h2>
        <p className="nums mt-3 font-display text-4xl font-bold leading-none text-ink-900">
          {score !== null ? score.toFixed(1) : "–"}
          <span className="ml-1 text-base font-medium text-ink-600">/ 10</span>
        </p>
        <p className="mt-3 max-w-xs text-pretty text-sm text-ink-700">
          {strongest ? (
            <>
              Strongest in {strongest.label}, <span className="nums">{strongest.value.toFixed(1)}</span>
              {weakest && weakest.value < strongest.value ? (
                <>
                  ; lowest in {weakest.label}, <span className="nums">{weakest.value.toFixed(1)}</span>
                </>
              ) : null}
              . Companies see these same numbers.
            </>
          ) : (
            "From your AI interview. Companies see this same number."
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <PrintReportButton />
          {feedbackLink ? (
            <a href={feedbackLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm", className: "touch:min-h-11" })}>
              <FileText className="size-4" aria-hidden />
              Feedback report
              <span className="sr-only"> (opens in a new tab)</span>
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
          {recordingLink ? (
            <a href={recordingLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm", className: "touch:min-h-11" })}>
              <Video className="size-4" aria-hidden />
              Recording
              <span className="sr-only"> (opens in a new tab)</span>
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
      <dl className="min-w-0 divide-y divide-ink-200 border-y border-ink-200 self-start">
        {axes.map((a) => (
          <div key={a.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-3.5">
            <dt className="text-base text-ink-900">{a.label}</dt>
            <dd className="nums font-display text-2xl font-semibold leading-none text-ink-900">
              {a.value !== null ? a.value.toFixed(1) : <span className="text-sm font-normal text-ink-700">Not rated</span>}
            </dd>
            <dd className="col-span-2 mt-2.5">
              <div aria-hidden className="h-1.5 overflow-hidden rounded-md bg-ink-200">
                <div className="h-full rounded-md bg-brand-800" style={{ width: `${((a.value ?? 0) / 10) * 100}%` }} />
              </div>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
