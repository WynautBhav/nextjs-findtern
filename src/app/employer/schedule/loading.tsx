import { SkeletonRow } from "@/components/app/layout-kit";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The schedule in its own shape: head with the book action, the Proposals/Interviews tabs, the status
 * tabs and the filter row, then a dated section of meeting rows. Announced once.
 */
export default function EmployerScheduleLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading your schedule</span>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4 lg:mb-5">
        <div className="min-w-0 max-w-3xl space-y-1">
          <Skeleton className="h-8 w-40 rounded-apple-sm lg:h-[2.625rem]" />
          <Skeleton className="h-12 w-96 max-w-full rounded-apple-sm sm:h-6" />
        </div>
        <Skeleton className="h-11 w-full rounded-apple-md sm:h-9 sm:w-56" />
      </div>

      <div className="mb-5 flex gap-x-5 border-b border-ink-100 sm:gap-x-7">
        <Skeleton className="my-3 h-5 w-20 rounded-apple-sm" />
        <Skeleton className="my-3 h-5 w-20 rounded-apple-sm" />
      </div>

      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap gap-x-3 border-b border-ink-100 sm:gap-x-7">
          {["w-10", "w-20", "w-36", "w-24"].map((w, i) => (
            <Skeleton key={i} className={`my-3.5 h-5 rounded-apple-sm ${w}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1.4fr)_10rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Skeleton className="col-span-2 h-11 rounded-apple-md lg:col-span-1" />
          <Skeleton className="h-11 rounded-apple-md" />
          <Skeleton className="h-11 rounded-apple-md" />
          <Skeleton className="h-11 rounded-apple-md" />
        </div>
      </div>

      <Skeleton className="mb-2 h-5 w-24 rounded-apple-sm" />
      <div className="divide-y divide-ink-100 border-y border-ink-100">
        {[0, 1, 2].map((i) => (
          <SkeletonRow key={i} className="py-4" />
        ))}
      </div>
    </div>
  );
}
