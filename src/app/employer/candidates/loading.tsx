import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the page it stands in for, so nothing jumps when it lands: the title and project switcher, the
 * funnel line, the lead count, then the filter column (lg+) beside the ruled rows (a numeral, a name, a rate).
 * No boxes: the real page has none.
 */
export default function CandidatesLoading() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading candidates
      </span>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4 lg:mb-5">
        <Skeleton className="h-8 w-44 rounded-md" />
        <Skeleton className="h-11 w-full rounded-md sm:w-96" />
      </div>
      <Skeleton className="h-12 w-full rounded-none" />

      <div className="mt-6 flex items-end justify-between gap-4">
        <Skeleton className="h-11 w-40 rounded-md" />
        <Skeleton className="h-11 w-48 rounded-md" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-7 w-20 rounded-md" />
        <Skeleton className="h-7 w-24 rounded-md" />
      </div>

      <div className="mt-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-x-10">
        <div className="hidden space-y-5 lg:block">
          <Skeleton className="h-11 w-full rounded-md" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 border-t border-ink-100 pt-4">
              <Skeleton className="h-4 w-28 rounded-md" />
              {i < 2 ? <Skeleton className="h-11 w-full rounded-md" /> : null}
            </div>
          ))}
        </div>

        <ul className="min-w-0 border-t border-ink-300">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-4 border-b border-ink-200 py-5 sm:grid-cols-[5.25rem_minmax(0,1fr)] sm:gap-x-5 sm:py-6">
              <Skeleton className="h-9 w-12 rounded-md sm:h-11 sm:w-16" />
              <div className="min-w-0 space-y-3">
                <Skeleton className="h-6 w-40 max-w-full rounded-md" />
                <Skeleton className="h-5 w-64 max-w-full rounded-md" />
                <Skeleton className="h-4 w-40 rounded-md" />
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 4 }).map((__, j) => (
                    <Skeleton key={j} className="h-7 w-20 rounded-md" />
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
