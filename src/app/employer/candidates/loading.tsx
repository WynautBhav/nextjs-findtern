import { Skeleton } from "@/components/ui/skeleton";
import { SURFACE_CLASS } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

/**
 * Shaped like the page it stands in for, so nothing jumps when it lands: the title, then the toolbar (one card
 * from lg: search and Sort, the count line, the skill row; plain rows on a phone), then the filter column (lg+)
 * beside the divided rows. Same columns and gaps as the real grid in page.tsx.
 */
export default function CandidatesLoading() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading candidates
      </span>
      <Skeleton className="h-10 w-44 rounded-apple-sm" />
      <Skeleton className="mb-3 mt-2 h-5 w-full max-w-md rounded-apple-sm sm:mb-4 lg:mb-5 lg:max-w-xl" />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-x-8">
        {/* Toolbar: a card at lg, plain rows below. */}
        <div className={cn(SURFACE_CLASS, "max-lg:contents lg:col-span-full lg:mb-5 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-4 lg:p-5")}>
          <Skeleton className="col-start-1 row-start-1 h-11 min-w-0 rounded-apple-sm lg:col-span-2 lg:h-12 xl:col-span-1 xl:max-w-[44rem]" />
          <Skeleton className="col-start-2 row-start-1 h-11 w-28 rounded-apple-sm lg:hidden" />
          <Skeleton className="col-span-2 row-start-2 mt-2 h-6 w-64 max-w-full rounded-apple-sm lg:col-span-1 lg:row-start-3 lg:mt-3 lg:w-72 xl:row-start-2 xl:w-96" />
          <div className="col-span-2 row-start-3 mb-3 mt-2 flex flex-wrap gap-2 lg:col-span-full lg:row-start-4 lg:mb-0 lg:mt-4 xl:row-start-3 lg:border-t lg:border-ink-100 lg:pt-4">
            <Skeleton className="h-9 w-24 rounded-apple-sm" />
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="mt-2 h-14 w-full max-w-xl rounded-apple-sm max-lg:hidden" />
          </div>
          <div className="col-span-2 row-start-4 mb-2 flex gap-2 lg:col-span-full lg:row-start-5 lg:mb-0 lg:mt-3 lg:border-t lg:border-ink-100 lg:pt-3 xl:row-start-4">
            <Skeleton className="h-9 w-36 rounded-lg" />
          </div>
          <div className="col-span-2 row-start-5 flex justify-end gap-2 lg:col-span-2 lg:row-start-2 lg:mt-3 lg:justify-start xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:mt-0 xl:justify-end">
            <Skeleton className="h-11 w-40 rounded-apple-sm" />
            <Skeleton className="h-11 w-24 rounded-apple-sm" />
            <Skeleton className="h-11 w-24 rounded-full xl:w-56" />
          </div>
          <div className="hidden justify-self-end lg:col-start-2 lg:row-start-3 lg:mt-3 lg:flex xl:row-start-2">
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </div>

        <div className="hidden divide-y divide-ink-100 lg:col-start-1 lg:row-start-2 lg:block">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-3 py-4">
              <Skeleton className="h-4 w-28 rounded-apple-sm" />
              {i < 2 ? <Skeleton className="h-10 w-full rounded-apple-sm" /> : null}
            </div>
          ))}
        </div>

        <div className="col-span-2 row-start-6 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-2">
          <ul className="mt-3 flex flex-col gap-4 lg:gap-5">
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
