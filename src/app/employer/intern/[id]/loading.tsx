import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the candidate profile: open header (photo, name, stats), the
 * hire box (right from lg, after the header on a phone), then sections.
 */
export default function CandidateLoading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading candidate</span>
      <Skeleton className="mb-4 h-5 w-40 rounded-apple-sm" />

      <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex items-start gap-4 pb-8 sm:gap-6 lg:col-start-1">
          <Skeleton className="size-18 shrink-0 rounded-full sm:size-24" />
          <div className="min-w-0 flex-1 space-y-3 pt-1">
            <Skeleton className="h-8 w-24 max-w-full rounded-apple-sm" />
            <Skeleton className="h-6 w-64 max-w-full rounded-apple-sm" />
            <Skeleton className="h-4 w-48 max-w-full rounded-apple-sm" />
            <Skeleton className="mt-6 h-12 w-72 max-w-full rounded-apple-sm" />
          </div>
        </div>
        <div className="space-y-4 rounded-apple-xl border border-ink-200/80 bg-white p-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <Skeleton className="h-8 w-28 rounded-apple-sm" />
          <Skeleton className="h-4 w-48 rounded-apple-sm" />
          <Skeleton className="h-11 w-full rounded-apple-sm" />
          <Skeleton className="h-11 w-full rounded-apple-sm" />
        </div>
        <div className="min-w-0 space-y-3 border-t border-ink-100 py-8 lg:col-start-1">
          <Skeleton className="h-5 w-24 rounded-apple-sm" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
