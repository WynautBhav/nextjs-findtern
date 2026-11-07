import { cn } from "@/lib/utils";
import type { BreakdownLine } from "@/lib/offer-breakdown";

/**
 * The lines from `offerBreakdown`, one per row, figures right-aligned and
 * tabular. Renders only; the sum lives in lib/offer-breakdown.ts.
 */
export function OfferBreakdownList({ lines, className }: { lines: BreakdownLine[]; className?: string }) {
  return (
    <dl className={cn("space-y-2.5", className)}>
      {lines.map((line) => (
        <div key={line.key} className="flex items-baseline justify-between gap-4">
          <dt className={cn("text-sm", line.key === "gst" ? "pl-3 text-text-subtle" : "text-ink-600")}>{line.label}</dt>
          <dd
            className={cn(
              "nums text-right",
              line.strong ? "text-lg font-semibold tracking-tight text-ink-900" : "text-sm font-medium text-ink-800",
              line.key === "gst" && "font-normal text-ink-600",
            )}
          >
            {line.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
