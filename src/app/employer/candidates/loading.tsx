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
        <Skeleton className="h-11 min-w-0 flex-1 rounded-xl lg:max-w-[44rem]" />
        <Skeleton className="h-11 w-28 shrink-0 rounded-xl lg:hidden" />
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
            <Skeleton className="h-9 w-40 rounded-xl" />
          </div>
          <ul className="flex flex-col gap-4 lg:gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="flex flex-col gap-4 rounded-2xl border border-ink-200 bg-white p-4 sm:gap-5 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <Skeleton className="size-12 rounded-2xl sm:size-14" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-5 w-24 rounded-apple-sm" />
                    <Skeleton className="h-3.5 w-40 max-w-full rounded-apple-sm" />
                  </div>
                  <Skeleton className="h-10 w-24 rounded-xl" />
                </div>
                <Skeleton className="h-6 w-72 max-w-full rounded-apple-sm" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 4 }).map((__, j) => (
                    <Skeleton key={j} className="h-7 w-20 rounded-lg" />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
