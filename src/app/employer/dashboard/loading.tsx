import { SkeletonRow } from "@/components/app/layout-kit";
import { SURFACE_CLASS } from "@/components/app/primitives";
import { Skeleton } from "@/components/ui/skeleton";

/** The head of a block under the hero: a title and its "see all" link, on the page's own 24px row. */
function HeadSkeleton() {
  return (
    <div className="mb-3 flex h-6 items-center justify-between gap-4">
      <Skeleton className="h-5 w-32 rounded-apple-sm" />
      <Skeleton className="h-4 w-24 rounded-apple-sm" />
    </div>
  );
}

/**
 * The employer dashboard in its own shape, on the page's 12-column grid and phone order: the hero band,
 * the funnel beside the activity tile, then the top matches and the projects. Announced once.
 */
export default function EmployerDashboardLoading() {
  return (
    <div role="status" aria-busy="true" className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
      <span className="sr-only">Loading your dashboard</span>
      <Skeleton className="h-[47.875rem] rounded-apple-xl sm:h-[29.5rem] xl:col-span-12" />

      <div className="min-w-0 max-xl:order-1 xl:col-span-8">
        <div className={`${SURFACE_CLASS} h-full min-h-[36rem] p-5 sm:min-h-[24.5rem] lg:p-6`}>
          <Skeleton className="h-5 w-40 rounded-apple-sm" />
          <Skeleton className="mt-2 h-4 w-56 max-w-full rounded-apple-sm" />
          <div className="mt-8 space-y-6">
            {["w-full", "w-3/4", "w-1/2", "w-1/4"].map((w) => (
              <div key={w} className="flex items-center gap-4">
                <Skeleton className="h-4 w-20 shrink-0 rounded-apple-sm" />
                <div className="min-w-0 flex-1">
                  <Skeleton className={`h-6 rounded-apple-sm ${w}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="min-w-0 max-xl:order-3 xl:col-span-4">
        <div className={`${SURFACE_CLASS} h-full min-h-[19rem] p-5 sm:min-h-[24.5rem] lg:p-6`}>
          <Skeleton className="h-5 w-36 rounded-apple-sm" />
          <Skeleton className="mt-2 h-4 w-48 max-w-full rounded-apple-sm" />
          <Skeleton className="mt-8 h-12 w-16 rounded-apple-sm" />
          <Skeleton className="mt-3 h-4 w-40 max-w-full rounded-apple-sm" />
        </div>
      </div>

      <div className="min-w-0 max-xl:order-2 xl:col-span-8">
        <HeadSkeleton />
        <div className="grid gap-4 sm:grid-cols-2 max-sm:[&>:nth-child(n+4)]:hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${SURFACE_CLASS} min-h-44 p-5`}>
              <div className="flex items-center gap-3">
                <Skeleton className="size-12 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-5 w-20 rounded-apple-sm" />
                  <Skeleton className="h-4 w-3/4 rounded-apple-sm" />
                </div>
              </div>
              <Skeleton className="mt-4 h-4 w-1/2 rounded-apple-sm" />
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-7 w-20 rounded-full" />
                <Skeleton className="h-7 w-24 rounded-full" />
                <Skeleton className="h-7 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="min-w-0 max-xl:order-4 xl:col-span-4">
        <HeadSkeleton />
        <div className={`${SURFACE_CLASS} px-5 py-2`}>
          <Skeleton className="mt-3 h-4 w-28 rounded-apple-sm" />
          <div className="divide-y divide-ink-100 max-sm:[&>:nth-child(n+4)]:hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
