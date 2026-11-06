import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the candidate profile: identity band, then the content column
 * and the hire box (first on a phone, right column from lg).
 */
export default function CandidateLoading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading candidate</span>
      <Skeleton className="mb-4 h-5 w-40 rounded-apple-sm" />

      <div className="mb-6 flex items-start gap-5 rounded-apple-xl border border-ink-200/80 bg-white p-5 sm:p-7">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-8 w-40 max-w-full rounded-apple-sm" />
          <Skeleton className="h-4 w-64 max-w-full rounded-apple-sm" />
          <Skeleton className="h-4 w-48 max-w-full rounded-apple-sm" />
        </div>
      </div>

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-4 rounded-apple-xl border border-ink-200/80 bg-white p-5 lg:order-2">
          <Skeleton className="h-4 w-28 rounded-apple-sm" />
          <Skeleton className="h-10 w-24 rounded-apple-sm" />
          <Skeleton className="h-6 w-32 rounded-apple-sm" />
          <Skeleton className="h-11 w-full rounded-apple-sm" />
          <Skeleton className="h-11 w-full rounded-apple-sm" />
        </div>
        <div className="min-w-0 space-y-8 lg:order-1">
          <div className="space-y-3">
            <Skeleton className="h-5 w-36 rounded-apple-sm" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full" />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-44 rounded-apple-sm" />
            <Skeleton className="h-56 w-full rounded-apple-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
