import { Skeleton } from "@/components/ui/skeleton";

/** Shaped like the offers list: head, underline tabs, then rows of role, meta and chips. */
export default function ProposalsLoading() {
  return (
    <div aria-busy="true" className="motion-reduce:[&_[data-slot=skeleton]]:animate-none">
      <span className="sr-only">Loading your offers</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-9 w-44 max-w-full rounded-apple-sm" />
        <Skeleton className="h-5 w-96 max-w-full rounded-apple-sm" />
      </div>
      <div className="mb-6 flex h-12 items-center gap-6 border-b border-ink-100">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-24 rounded-apple-sm" />
        ))}
      </div>
      <div className="divide-y divide-ink-100 overflow-hidden rounded-apple-xl bg-white">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2.5 px-5 py-4 lg:px-6">
            <Skeleton className="h-5 w-56 max-w-full rounded-apple-sm" />
            <Skeleton className="h-4 w-72 max-w-full rounded-apple-sm" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 4 }).map((__, j) => (
                <Skeleton key={j} className="h-6 w-20 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
