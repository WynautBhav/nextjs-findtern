import { ExternalLink, FileText, Video } from "lucide-react";

import { AxisRadar } from "@/components/app/axis-radar";
import { Surface } from "@/components/app/primitives";
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
 * The intern's own score report: the Findtern Score as a ring, the four
 * axes it averages as a radar. Same stored numbers the employer sees,
 * nothing estimated. No band name: interns are never shown the pricing bands.
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
    <Surface as="section" aria-labelledby="score-title" className="p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="score-title" className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
            Your Findtern Score
          </h2>
          <p className="mt-1 max-w-xl text-pretty text-sm text-text-subtle">
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
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintReportButton />
            {feedbackLink ? (
              <a href={feedbackLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
                <FileText className="size-4" aria-hidden />
                Feedback report
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
            {recordingLink ? (
              <a href={recordingLink} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
                <Video className="size-4" aria-hidden />
                Recording
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
        </div>
      </div>

      <div className="mt-6 grid items-center justify-items-center gap-8 md:grid-cols-[auto_minmax(0,24rem)] md:justify-evenly">
        <ScoreRing score={score} />
        <AxisRadar axes={axes} />
      </div>
    </Surface>
  );
}

/** A thick arc, the score in its centre. Out of 10, starting at 12 o'clock. */
function ScoreRing({ score }: { score: number | null }) {
  const R = 84;
  const C = 2 * Math.PI * R;
  const filled = score !== null ? (score / 10) * C : 0;
  return (
    <div className="relative size-52 shrink-0">
      <svg viewBox="0 0 200 200" className="size-full -rotate-90" aria-hidden>
        <circle cx="100" cy="100" r={R} fill="none" strokeWidth="18" className="stroke-ink-100" />
        {score !== null ? (
          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${C}`}
            className="stroke-brand-700"
          />
        ) : null}
      </svg>
      <p className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="nums text-5xl font-medium leading-none tracking-[-0.04em] text-ink-900">
          {score !== null ? score.toFixed(1) : "–"}
        </span>
        <span className="mt-2 text-sm text-text-subtle">out of 10</span>
      </p>
    </div>
  );
}
