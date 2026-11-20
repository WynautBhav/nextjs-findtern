import { cn } from "@/lib/utils";

/**
 * A short "how it works" list: a round number beside one sentence each.
 * Used inside a `Tile` on Timesheets and Earnings, so the two read the same.
 */
export function NumberedSteps({ steps, className }: { steps: readonly string[]; className?: string }) {
  return (
    <ol className={cn("space-y-3", className)}>
      {steps.map((line, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="nums grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">
            {i + 1}
          </span>
          <span className="text-pretty text-sm text-ink-700">{line}</span>
        </li>
      ))}
    </ol>
  );
}
