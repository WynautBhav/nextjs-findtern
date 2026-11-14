import { Skeleton } from "@/components/ui/skeleton";

/** A section card: the real card's border, radius and padding, a title row and a few lines. */
function CardSkeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`rounded-2xl border border-ink-200 bg-white p-5 shadow-xs sm:p-6 ${className}`}>
      <Skeleton className="h-5 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={`h-4 ${i % 2 ? "w-2/3" : "w-full"}`} />
        ))}
      </div>
    </div>
  );
}

/**
 * The profile in its own shape: head with the edit action, then the summary card (a mint band, avatar,
 * name, score, completeness) beside the section cards. One column on a phone. Announced once.
 * Card heights are the loaded ones (see the note in the list), so the page does not jump much when the content lands.
 */
export default function InternProfileLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading your profile</span>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
        <div className="min-w-0 max-w-3xl space-y-1">
          <Skeleton className="h-8 w-44 rounded-apple-sm lg:h-[2.625rem]" />
          <Skeleton className="h-12 w-80 max-w-full rounded-apple-sm sm:h-6" />
        </div>
        <Skeleton className="h-11 w-full rounded-apple-md sm:w-36" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[19.5rem_minmax(0,1fr)] xl:items-start xl:gap-8">
        <div className="min-h-[47.4rem] min-w-0 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xs xl:min-h-[45.75rem]">
          <div className="h-16 border-b border-ink-100 bg-ink-50 sm:h-20 xl:h-12" />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <Skeleton className="-mt-9 size-[4.5rem] rounded-2xl ring-4 ring-white sm:-mt-11 sm:size-20 xl:-mt-8 xl:size-16" />
            <Skeleton className="mt-3 h-6 w-44" />
            <Skeleton className="mt-2 h-4 w-3/4" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="mt-4 h-6 w-28 rounded-full" />
            <div className="mt-6 border-t border-ink-100 pt-6">
              <Skeleton className="h-4 w-28" />
              <div className="mt-3 flex items-center gap-4">
                <Skeleton className="size-[6.5rem] shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            </div>
            <div className="mt-6 border-t border-ink-100 pt-6">
              <div className="flex items-baseline justify-between gap-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-10" />
              </div>
              <Skeleton className="mt-2.5 h-2 w-full rounded-full" />
              <Skeleton className="mt-4 h-3 w-24" />
              <Skeleton className="mt-2 h-4 w-40" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-3 h-9 w-full rounded-md touch:h-11" />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <div className="min-h-[38rem] rounded-2xl border border-ink-200 bg-white p-5 shadow-xs sm:min-h-[32.75rem] sm:p-6">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-2 h-4 w-2/3" />
            <Skeleton className="mt-4 h-10 w-full rounded-md" />
            <div className="mt-5 border-t border-ink-100 pt-5">
              <Skeleton className="h-4 w-36" />
              <div className="mt-3 rounded-xl border border-ink-200 p-4 sm:p-5">
                <div className="flex gap-3.5 sm:gap-5">
                  <Skeleton className="size-12 shrink-0 rounded-2xl sm:size-14" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-5 w-10" />
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 sm:pl-[4.75rem]">
                  {["w-20", "w-24", "w-16", "w-28", "w-20"].map((w, i) => (
                    <Skeleton key={i} className={`h-7 rounded-full ${w}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Heights are the loaded cards' (phone, then wide), measured on a sparse profile: a fuller one only grows downwards. */}
          <CardSkeleton lines={3} className="min-h-[20.5rem] sm:min-h-[12.875rem]" />
          <CardSkeleton lines={2} className="min-h-[8.125rem]" />
          <CardSkeleton lines={3} className="min-h-[13.5rem]" />
          <CardSkeleton lines={3} className="min-h-[15rem] sm:min-h-[10.5rem]" />
          <CardSkeleton lines={2} className="min-h-[13.5rem] sm:min-h-[9rem]" />
          <CardSkeleton lines={3} className="min-h-[12.875rem]" />
          <CardSkeleton lines={4} className="min-h-[30.75rem] sm:min-h-[21.25rem]" />
          <CardSkeleton lines={3} className="min-h-[25.5rem] sm:min-h-[21.5rem]" />
        </div>
      </div>
    </div>
  );
}
