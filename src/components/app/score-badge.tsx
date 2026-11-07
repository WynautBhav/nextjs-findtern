import { cn } from "@/lib/utils";
import { scoreA11y, scoreParts } from "./score-helpers";
import { ScoreDial } from "./score-dial";

export { scoreLabel } from "./score-helpers";

/** Compact pill: tiny ring, the number, the band word. Neutral; the ring carries the score. */
export function ScoreBadge({ score, size = "md", className }: { score: number; size?: "sm" | "md"; className?: string }) {
  const { value, band } = scoreParts(score);
  const sm = size === "sm";
  return (
    <span
      title={scoreA11y(score)}
      className={cn(
        "nums inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-white ring-1 ring-inset ring-ink-200",
        sm ? "gap-1.5 py-0.5 pl-1 pr-2 text-xs" : "gap-2 py-1 pl-1.5 pr-3 text-sm",
        className,
      )}
    >
      <span className="sr-only">{scoreA11y(score)}</span>
      <ScoreDial score={score} size="xs" className={sm ? "!size-5" : ""} />
      <span aria-hidden className="font-semibold tabular-nums text-ink-900">{value}</span>
      <span aria-hidden className="font-medium text-text-subtle">{band}</span>
    </span>
  );
}
