import { SkeletonList } from "@/components/app/layout-kit";
import { SURFACE_CLASS } from "@/components/app/primitives";
import { Skeleton } from "@/components/ui/skeleton";

/** Page-shaped placeholder for any employer screen: a title and lede, a toolbar row, then a list. The shell stays put. */
export default function EmployerLoading() {
  return (
    <div aria-busy="true">
      <div className="mb-6 space-y-3 lg:mb-8">
        <Skeleton className="h-8 w-56 max-w-full rounded-apple-sm" />
        <Skeleton className="h-4 w-80 max-w-full rounded-apple-sm" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Skeleton className="h-11 w-full rounded-apple-sm sm:w-72" />
        <Skeleton className="h-11 w-28 rounded-apple-sm" />
      </div>
      <div className={`${SURFACE_CLASS} px-4 sm:px-5`}>
        <SkeletonList rows={6} />
      </div>
      <span className="sr-only">Loading this page</span>
    </div>
  );
}
