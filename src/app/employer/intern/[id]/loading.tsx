import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the candidate profile: the statement header (photo, name, degree), the hire column (right from lg,
 * after the header on a phone), then ruled sections. No boxes: the real page has none.
 */
export default function CandidateLoading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading candidate</span>
      <Skeleton className="mb-5 h-5 w-40 rounded-md" />

      <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex items-start gap-4 pb-8 sm:gap-5 lg:col-start-1">
          <Skeleton className="size-14 shrink-0 rounded-full sm:size-16" />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-9 w-40 max-w-full rounded-md sm:h-11" />
            <Skeleton className="h-6 w-64 max-w-full rounded-md" />
            <Skeleton className="h-4 w-48 max-w-full rounded-md" />
          </div>
        </div>
        <div className="space-y-4 border-t-2 border-ink-300 pt-4 pb-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-11 w-36 rounded-md" />
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
        <div className="min-w-0 space-y-10 lg:col-start-1">
          {Array.from({ length: 2 }).map((_, s) => (
            <div key={s} className="space-y-3">
              <Skeleton className="h-6 w-32 rounded-md" />
              <div className="border-t border-ink-200 pt-3">
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 5 }).map((__, i) => (
                    <Skeleton key={i} className="h-7 w-24 rounded-md" />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
