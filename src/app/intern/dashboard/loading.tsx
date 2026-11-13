import { SURFACE_CLASS } from "@/components/app/primitives";
import { STAT_ROW } from "@/components/app/tiles";
import { Skeleton } from "@/components/ui/skeleton";

/** A tile as the dashboard draws it: same padding, a title row, then body lines. */
function TileSkeleton({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={`${SURFACE_CLASS} min-w-0 p-5 lg:p-6 ${className ?? ""}`}>
      <div className="mb-4 flex min-h-9 items-center">
        <Skeleton className="h-5 w-32 rounded-apple-sm" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={`h-4 rounded-apple-sm ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
        ))}
      </div>
    </div>
  );
}

/**
 * The intern Home in its own shape, so nothing jumps when the data lands: greeting, the needs-you
 * and hours tiles, the key numbers, then activity beside the narrow facts. Same grids and gaps as the page.
 */
export default function InternDashboardLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading your home</span>
      <div className="mb-6 space-y-1 lg:mb-8">
        <Skeleton className="h-8 w-56 max-w-full rounded-apple-sm lg:h-[2.625rem]" />
        <Skeleton className="h-6 w-72 max-w-full rounded-apple-sm" />
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="grid min-w-0 gap-4 md:max-xl:grid-cols-2">
            <TileSkeleton lines={4} className="min-h-56" />
            <TileSkeleton lines={3} className="min-h-40" />
          </div>
          <div className={`${SURFACE_CLASS} min-w-0 self-start p-5 lg:p-6 xl:col-span-2`}>
            <div className="mb-4 flex min-h-9 items-center">
              <Skeleton className="h-5 w-40 rounded-apple-sm" />
            </div>
            <Skeleton className="h-52 w-full rounded-apple-md" />
          </div>
        </div>

        <div className={STAT_ROW}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${SURFACE_CLASS} min-w-0 p-4 sm:p-5 ${i === 0 ? "max-sm:col-span-2" : ""}`}>
              <Skeleton className="h-4 w-24 rounded-apple-sm" />
              <Skeleton className="mt-3 h-9 w-20 rounded-apple-sm" />
              <Skeleton className="mt-3 h-4 w-32 max-w-full rounded-apple-sm" />
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <TileSkeleton lines={6} className="min-h-64 xl:col-span-2" />
          <div className="grid min-w-0 content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
            <TileSkeleton lines={3} className="min-h-40" />
            <TileSkeleton lines={3} className="min-h-40" />
          </div>
        </div>
      </div>
    </div>
  );
}
