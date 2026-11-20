import { SURFACE_CLASS } from "@/components/app/primitives";
import { STAT_ROW } from "@/components/app/tiles";
import { homeTopLayout } from "@/components/intern/home/home-layout";
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

// The grids are the page's own (home-layout.ts), so the skeleton and the loaded page break at the same widths.
const top = homeTopLayout({ waiting: true, nextUp: true, chart: true })!;

/**
 * The intern Home in its own shape, so nothing jumps when the data lands: greeting, the needs-you
 * and hours tiles, the key numbers, then activity beside the narrow facts. Same grids and gaps as the page, with no
 * hard-coded card heights: a new intern (Getting started) or one without hours changes less than a fixed slab would.
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
        <div className="@container">
          <div className={top.root}>
            <div className={`flex min-w-0 flex-col [&>div]:flex-1 ${top.waiting}`}>
              <TileSkeleton lines={4} />
            </div>
            <div className={`flex min-w-0 flex-col [&>div]:flex-1 ${top.nextUp}`}>
              <TileSkeleton lines={3} />
            </div>
            <div className={`flex min-w-0 flex-col [&>div]:flex-1 ${top.chart}`}>
              <div className={`${SURFACE_CLASS} min-w-0 p-5 lg:p-6`}>
                <div className="mb-4 flex min-h-9 items-center">
                  <Skeleton className="h-5 w-40 rounded-apple-sm" />
                </div>
                <Skeleton className="h-52 w-full rounded-apple-md" />
              </div>
            </div>
          </div>
        </div>

        <div className={STAT_ROW}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${SURFACE_CLASS} min-w-0 p-4 sm:min-h-[10.3rem] sm:p-5 ${i === 0 ? "min-h-[10.5rem] max-sm:col-span-2" : "min-h-36"}`}>
              <Skeleton className="h-4 w-24 rounded-apple-sm" />
              <Skeleton className="mt-3 h-9 w-20 rounded-apple-sm" />
              <Skeleton className="mt-3 h-4 w-32 max-w-full rounded-apple-sm" />
            </div>
          ))}
        </div>

        <div className="@container">
          <div className="grid gap-4 @4xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <TileSkeleton lines={5} />
            <div className="grid min-w-0 content-start items-start gap-4 @xl:grid-cols-2 @4xl:grid-cols-1">
              <TileSkeleton lines={3} />
              <TileSkeleton lines={3} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
