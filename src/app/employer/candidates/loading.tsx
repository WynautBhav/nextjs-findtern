import { Skeleton } from "@/components/ui/skeleton";

/** Same frame as the page: hero, filter rail (lg), skills tile, toolbar, then cards sized like real ones. */
export default function CandidatesLoading() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-6 h-[16.5rem] rounded-[28px] bg-brand-100/70 sm:h-[18.5rem]" />
      <div className="lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start lg:gap-7">
        <Skeleton className="mb-6 hidden h-[34rem] rounded-[24px] bg-white lg:block" />
        <div className="min-w-0">
          <Skeleton className="mb-4 h-28 rounded-[24px] bg-white" />
          <Skeleton className="mb-5 h-14 rounded-[22px] bg-white" />
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" role="status" aria-label="Loading candidates">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex min-h-[24rem] flex-col gap-4 rounded-[24px] bg-white p-6 shadow-tile">
                <div className="flex items-start gap-4">
                  <Skeleton className="size-14 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2 pt-1">
                    <Skeleton className="h-5 w-2/5" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="size-14 shrink-0 rounded-full" />
                </div>
                <Skeleton className="mt-2 h-9 w-28" />
                <Skeleton className="h-1.5 w-full rounded-full" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-14 rounded-full" />
                </div>
                <Skeleton className="h-16 w-full rounded-[18px]" />
                <Skeleton className="mt-auto h-10 w-36 rounded-full" />
              </li>
            ))}
          </ul>
          <span className="sr-only">Loading candidates</span>
        </div>
      </div>
    </div>
  );
}
