import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the page it stands in for, so nothing jumps when it lands: the
 * title, search (with Filters beside it on phones), the skill line, then the
 * filter column (lg+) beside the results bar and the divided rows. No boxes:
 * the real page has none.
 */
export default function CandidatesLoading() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading candidates
      </span>
      <Skeleton className="mb-4 h-8 w-44 rounded-apple-sm lg:mb-6" />

      <div className="flex gap-2">
        <Skeleton className="h-11 min-w-0 flex-1 rounded-full lg:max-w-[44rem]" />
        <Skeleton className="h-11 w-28 shrink-0 rounded-full lg:hidden" />
      </div>
      <div className="mb-3 mt-3 flex gap-2 lg:mb-6">
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>

      <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-x-12">
        <div className="hidden divide-y divide-ink-100 lg:block">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-3 py-4">
              <Skeleton className="h-4 w-28 rounded-apple-sm" />
              {i < 2 ? <Skeleton className="h-10 w-full rounded-apple-sm" /> : null}
            </div>
          ))}
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-3">
            <Skeleton className="h-6 w-48 rounded-apple-sm" />
            <Skeleton className="h-9 w-40 rounded-full" />
          </div>
          <ul className="divide-y divide-ink-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3.5 gap-y-3 py-5 sm:gap-x-5 sm:py-6">
                <Skeleton className="size-12 rounded-full sm:size-14" />
                <div className="min-w-0 space-y-2">
                  <Skeleton className="h-4 w-10 rounded-apple-sm" />
                  <Skeleton className="h-5 w-64 max-w-full rounded-apple-sm" />
                  <Skeleton className="h-3.5 w-24 rounded-apple-sm" />
                </div>
                <div className="flex gap-1.5">
                  <Skeleton className="size-11 rounded-full sm:size-9" />
                  <Skeleton className="hidden h-9 w-36 rounded-full sm:block" />
                </div>
                <div className="col-span-3 space-y-3 sm:col-span-2 sm:col-start-2">
                  <Skeleton className="h-4 w-72 max-w-full rounded-apple-sm" />
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 4 }).map((__, j) => (
                      <Skeleton key={j} className="h-7 w-20 rounded-full" />
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
