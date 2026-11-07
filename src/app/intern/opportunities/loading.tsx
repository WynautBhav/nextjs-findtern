import { Skeleton } from "@/components/ui/skeleton";

/** Shaped like the open-roles list: head, filter column (lg+), then wide rows of title, meta and chips. */
export default function OpportunitiesLoading() {
  return (
    <div aria-busy="true" className="motion-reduce:[&_[data-slot=skeleton]]:animate-none">
      <span className="sr-only">Loading open roles</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-9 w-48 max-w-full rounded-apple-sm" />
        <Skeleton className="h-5 w-96 max-w-full rounded-apple-sm" />
      </div>
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20 rounded-apple-sm" />
              <Skeleton className="h-8 w-full rounded-apple-sm" />
              <Skeleton className="h-8 w-full rounded-apple-sm" />
            </div>
          ))}
        </div>
        <Skeleton className="h-11 w-full rounded-apple-md lg:hidden" />
        <div className="divide-y divide-ink-100 border-y border-ink-100">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2.5 py-5">
              <Skeleton className="h-5 w-56 max-w-full rounded-apple-sm" />
              <Skeleton className="h-4 w-72 max-w-full rounded-apple-sm" />
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 4 }).map((__, j) => (
                  <Skeleton key={j} className="h-7 w-20 rounded-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
