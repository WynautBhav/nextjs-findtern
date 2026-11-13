import { Skeleton } from "@/components/ui/skeleton";

/** A profile section: a title and a few detail rows, under the same hairline and padding as the page. */
function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="border-t border-ink-200/70 py-6">
      <Skeleton className="h-5 w-40 rounded-apple-sm" />
      <div className="mt-3 divide-y divide-ink-100">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-6 py-3">
            <Skeleton className="h-4 w-28 rounded-apple-sm" />
            <Skeleton className="h-4 w-1/2 rounded-apple-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** "What is still missing": a title and count, a progress bar, the next two steps. */
function CompletionSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <Skeleton className="h-5 w-36 rounded-apple-sm" />
        <Skeleton className="h-4 w-12 rounded-apple-sm" />
      </div>
      <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
      <Skeleton className="mt-4 h-4 w-3/4 rounded-apple-sm" />
      <Skeleton className="mt-3 h-4 w-2/3 rounded-apple-sm" />
    </div>
  );
}

/**
 * The profile in its own shape: head with the edit action, "What employers see" with the row card,
 * then the sections on the left and the settings column on the right (above them on a phone). Announced once.
 */
export default function InternProfileLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading your profile</span>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
        <div className="min-w-0 max-w-3xl space-y-1">
          <Skeleton className="h-8 w-44 rounded-apple-sm lg:h-[2.625rem]" />
          <Skeleton className="h-6 w-80 max-w-full rounded-apple-sm" />
        </div>
        <Skeleton className="h-11 w-full rounded-apple-md sm:w-36" />
      </div>

      <div className="grid gap-x-12 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <CompletionSkeleton className="mb-6 xl:hidden" />
        <div className="min-w-0">
          <div className="pb-6">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-5 w-40 rounded-apple-sm" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="mt-2 h-4 w-2/3 rounded-apple-sm" />
            <div className="mt-4 rounded-apple-xl border border-ink-200/80 bg-white px-4 py-5 sm:px-6">
              <div className="flex gap-3.5 sm:gap-5">
                <Skeleton className="size-14 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-5 w-16 rounded-apple-sm" />
                  <Skeleton className="h-6 w-3/4 rounded-apple-sm" />
                  <Skeleton className="h-4 w-28 rounded-apple-sm" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 sm:pl-[4.75rem]">
                {["w-20", "w-24", "w-16", "w-28", "w-20"].map((w, i) => (
                  <Skeleton key={i} className={`h-7 rounded-full ${w}`} />
                ))}
              </div>
            </div>
          </div>
          <SectionSkeleton rows={4} />
          <SectionSkeleton rows={3} />
          <SectionSkeleton rows={3} />
        </div>

        <aside className="min-w-0 border-t border-ink-200/70 xl:border-t-0 xl:border-l xl:pl-8">
          <CompletionSkeleton className="border-b border-ink-200/70 pb-6 max-xl:hidden" />
          <div className="border-b border-ink-200/70 py-6">
            <Skeleton className="h-5 w-28 rounded-apple-sm" />
            <Skeleton className="mt-3 h-8 w-full rounded-apple-md" />
          </div>
          <div className="space-y-3 py-6">
            <Skeleton className="h-5 w-48 rounded-apple-sm" />
            <Skeleton className="h-4 w-full rounded-apple-sm" />
            <Skeleton className="h-4 w-5/6 rounded-apple-sm" />
            <Skeleton className="h-4 w-2/3 rounded-apple-sm" />
          </div>
        </aside>
      </div>
    </div>
  );
}
