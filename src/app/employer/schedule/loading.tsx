import { SkeletonRow } from "@/components/app/layout-kit";
import { Surface } from "@/components/app/primitives";
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

      <Surface className="mb-5 flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap gap-1">
          {["w-14", "w-24", "w-40", "w-28"].map((w, i) => (
            <Skeleton key={i} className={`h-11 rounded-full lg:h-10 ${w}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1.4fr)_10rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Skeleton className="col-span-2 h-11 rounded-apple-md lg:col-span-1" />
          <Skeleton className="h-11 rounded-apple-md" />
          <Skeleton className="h-11 rounded-apple-md" />
          <Skeleton className="h-11 rounded-apple-md" />
        </div>
      </Surface>

      <Skeleton className="mb-2 h-6 w-24 rounded-apple-sm" />
      <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden px-4 sm:px-5">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <SkeletonRow className="py-4" />
          </li>
        ))}
      </Surface>
    </div>
  );
}
