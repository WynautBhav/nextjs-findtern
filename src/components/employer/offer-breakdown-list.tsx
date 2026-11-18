import { cn } from "@/lib/utils";
import type { BreakdownLine } from "@/lib/offer-breakdown";

/**
 * The lines from `offerBreakdown`, ruled like a statement: label left, figure right and tabular,
 * the monthly total in display figures. Renders only; the sum lives in lib/offer-breakdown.ts.
 */
export function OfferBreakdownList({ lines, className }: { lines: BreakdownLine[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-ink-200 border-b border-ink-200", className)}>
      {lines.map((line) => (
        <div key={line.key} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className={cn("text-sm", line.key === "gst" ? "pl-3 text-ink-600" : "text-ink-700")}>{line.label}</dt>
          <dd
            className={cn(
              "nums text-right",
              line.strong ? "font-display text-lg font-semibold text-ink-900" : "text-sm font-medium text-ink-900",
              line.key === "gst" && "font-normal text-ink-700",
            )}
          >
            {line.struck ? (
              <>
                <s className="mr-1.5 font-normal text-ink-600">{line.struck}</s>
                <span className="font-semibold text-brand-800">{line.value}</span>
              </>
            ) : (
              line.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
