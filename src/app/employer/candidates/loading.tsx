import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the page it stands in for: the head, the filter column (lg+),
 * the toolbar and a few wide rows. The console shell stays put.
 */
export default function CandidatesLoading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading candidates</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-9 w-56 max-w-full rounded-apple-sm" />
        <Skeleton className="h-5 w-80 max-w-full rounded-apple-sm" />
      </div>

      <div className="lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="mb-4 lg:mb-0">
          <Skeleton className="h-11 w-full rounded-apple-md lg:hidden" />
          <div className="hidden space-y-5 rounded-apple-xl border border-ink-200/80 bg-white p-5 lg:block">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2.5">
                <Skeleton className="h-4 w-24 rounded-apple-sm" />
                <Skeleton className="h-10 w-full rounded-apple-sm" />
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <Skeleton className="mb-3 h-11 w-full rounded-full" />
          <div className="mb-3 flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-32 rounded-apple-sm" />
            <Skeleton className="h-10 w-48 rounded-apple-sm" />
          </div>
          <div className="divide-y divide-ink-100 overflow-hidden rounded-apple-xl border border-ink-200/80 bg-white">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-4 sm:px-5">
                <Skeleton className="size-14 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2.5">
                  <Skeleton className="h-4 w-40 max-w-full rounded-apple-sm" />
                  <Skeleton className="h-3.5 w-64 max-w-full rounded-apple-sm" />
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 4 }).map((__, j) => (
                      <Skeleton key={j} className="h-6 w-20 rounded-full" />
                    ))}
                  </div>
                </div>
                <Skeleton className="hidden h-11 w-36 shrink-0 rounded-apple-sm sm:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
