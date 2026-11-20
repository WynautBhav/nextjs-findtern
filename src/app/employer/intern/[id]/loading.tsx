import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the candidate profile (`ProfileView`): a light hero card with the
 * score ring, the hire box (right from xl, after the hero below it), then the
 * AI interview, skills and detail cards.
 */
export default function CandidateLoading() {
  return (
    <div aria-busy="true" className="pb-44 xl:pb-12">
      <span className="sr-only">Loading candidate</span>
      <Skeleton className="mb-4 h-5 w-40 rounded-apple-sm" />

      <div className="grid gap-x-12 gap-y-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 rounded-apple-xl bg-white p-5 shadow-tile sm:p-7 xl:col-start-1">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8">
            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
              <Skeleton className="size-20 shrink-0 rounded-full sm:size-24" />
              <div className="min-w-0 flex-1 space-y-3">
                <Skeleton className="h-9 w-40 max-w-full rounded-apple-sm" />
                <Skeleton className="h-6 w-64 max-w-full rounded-apple-sm" />
                <div className="flex flex-wrap gap-2 pt-2">
                  <Skeleton className="h-9 w-32 rounded-full" />
                  <Skeleton className="h-9 w-28 rounded-full" />
                  <Skeleton className="h-9 w-24 rounded-full" />
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3 border-t border-ink-100 pt-6 md:w-56 md:border-l md:border-t-0 md:pl-8 md:pt-0">
              <Skeleton className="size-44 rounded-full" />
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-4 w-44 max-w-full rounded-apple-sm" />
            </div>
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-[24px] shadow-tile xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:self-start">
          <div className="space-y-3 bg-brand-900/10 p-6">
            <Skeleton className="h-12 w-40 rounded-apple-sm" />
            <Skeleton className="h-4 w-56 max-w-full rounded-apple-sm" />
            <Skeleton className="h-11 w-full rounded-apple-sm max-xl:hidden" />
          </div>
          <div className="space-y-2 bg-white p-6">
            <Skeleton className="h-11 w-full rounded-apple-sm" />
            <Skeleton className="h-11 w-full rounded-apple-sm" />
          </div>
        </div>

        <div className="min-w-0 space-y-8 xl:col-start-1">
          <div>
            <Skeleton className="mb-4 h-6 w-32 rounded-apple-sm" />
            <Skeleton className="h-64 w-full rounded-apple-xl" />
          </div>
          <div>
            <Skeleton className="mb-4 h-6 w-16 rounded-apple-sm" />
            <Skeleton className="h-36 w-full rounded-apple-xl" />
          </div>
          <div>
            <Skeleton className="mb-4 h-6 w-36 rounded-apple-sm" />
            <Skeleton className="h-24 w-full rounded-apple-xl" />
          </div>
          <div>
            <Skeleton className="mb-4 h-6 w-24 rounded-apple-sm" />
            <Skeleton className="h-28 w-full rounded-apple-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
