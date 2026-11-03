import { Skeleton } from "@/components/ui/skeleton";

/**
 * The dashboard's own loading shape, in the overview's layout so nothing moves when the data lands:
 * title and finding with two pills, four KPI tiles (2-up on a phone), then the two rows of panels on
 * the same 12-column grid and gap as the page. Flat blocks at their real sizes. Announced once.
 */
const PANEL = "rounded-[var(--radius-admin-card)] bg-[color:var(--admin-panel)] p-[var(--admin-pad-panel)]";

function PanelSkeleton({ className, rows = 0, height }: { className: string; rows?: number; height?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className={`${PANEL} h-full`}>
        <Skeleton className="h-6 w-40 rounded-apple-sm" />
        <Skeleton className="mt-2 h-4 w-56 max-w-full rounded-apple-sm" />
        {height ? <Skeleton className={`mt-5 w-full rounded-apple-sm ${height}`} /> : null}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="mt-3 flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4 rounded-apple-sm" />
              <Skeleton className="h-3 w-1/3 rounded-apple-sm" />
            </div>
            <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading the dashboard</span>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 lg:mb-8">
        <div className="min-w-0 max-w-3xl space-y-2">
          <Skeleton className="h-9 w-44 rounded-apple-sm" />
          <Skeleton className="h-5 w-full max-w-xl rounded-apple-sm" />
        </div>
        <div className="flex gap-2 max-sm:w-full">
          <Skeleton className="h-11 w-36 rounded-full" />
          <Skeleton className="h-11 w-40 rounded-full" />
        </div>
      </div>

      <div className="space-y-[var(--admin-gap)]">
        <div className="grid grid-cols-2 gap-[var(--admin-gap)] xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${PANEL} min-h-36`}>
              <Skeleton className="h-5 w-28 rounded-apple-sm" />
              <Skeleton className="mt-4 h-10 w-20 rounded-apple-sm" />
              <Skeleton className="mt-3 h-4 w-32 max-w-full rounded-apple-sm" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-[var(--admin-gap)] lg:grid-cols-12">
          <PanelSkeleton className="lg:col-span-6 xl:col-span-4" height="h-44" />
          <PanelSkeleton className="lg:col-span-6 xl:col-span-4" height="h-32" />
          <PanelSkeleton className="lg:col-span-12 xl:col-span-4" rows={5} />
        </div>

        <div className="grid grid-cols-1 gap-[var(--admin-gap)] lg:grid-cols-12">
          <PanelSkeleton className="lg:col-span-12 xl:col-span-5" rows={5} />
          <PanelSkeleton className="lg:col-span-6 xl:col-span-3" height="h-32" />
          <PanelSkeleton className="lg:col-span-6 xl:col-span-4" height="h-32" />
        </div>
      </div>
    </div>
  );
}
