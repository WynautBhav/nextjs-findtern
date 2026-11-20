import { Check } from "lucide-react";

import type { WorkPreferenceRow } from "@/lib/work-preferences";
import { cn } from "@/lib/utils";

/** The rows of `workPreferenceRows` as labelled chips; an empty row reads "Not specified". */
export function WorkPreferenceList({ rows, className }: { rows: WorkPreferenceRow[]; className?: string }) {
  return (
    <dl className={cn("space-y-4", className)}>
      {rows.map((row) => (
        <div key={row.key} className="grid min-w-0 gap-1.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
          <dt className="text-sm text-ink-600 sm:pt-1">{row.label}</dt>
          <dd className="min-w-0">
            {row.chips.length === 0 ? (
              <span className="text-sm text-ink-600">Not specified</span>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {row.chips.map((chip) => (
                  <li
                    key={chip.label}
                    className={cn(
                      "inline-flex max-w-full items-center gap-1.5 break-words rounded-full px-3 py-1 text-sm font-medium",
                      chip.matchesProject ? "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200/70" : "bg-ink-100 text-ink-800",
                    )}
                  >
                    {chip.label}
                    {chip.current ? <span className="font-normal text-ink-600">(current city)</span> : null}
                    {chip.matchesProject ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                        <Check className="size-3.5 shrink-0" aria-hidden />
                        Matches your project city
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
