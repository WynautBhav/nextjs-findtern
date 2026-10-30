import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TILE = "rounded-apple-xl bg-surface-raised p-5 shadow-tile lg:p-6";

/**
 * Loading state for every intern screen: a page head, then a neutral bento
 * (a short row, then a wide tile beside a narrow one). Generic on purpose,
 * so it doesn't promise a layout any one page doesn't have.
 */
export default function InternLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="motion-safe:animate-pulse">
      <div className="mb-6 space-y-3 md:mb-8">
        <Skeleton className="h-8 w-56 max-w-full rounded-apple-sm" />
        <Skeleton className="h-5 w-96 max-w-full rounded-apple-sm" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={cn(TILE, "space-y-4", i > 0 && "max-md:hidden")}>
            <Skeleton className="h-4 w-28 rounded-apple-sm" />
            <Skeleton className="h-9 w-24 rounded-apple-sm" />
          </div>
        ))}
        <div className={cn(TILE, "space-y-4 md:col-span-2")}>
          <Skeleton className="h-5 w-40 rounded-apple-sm" />
          <Skeleton className="h-40 w-full rounded-apple-md" />
        </div>
        <div className={cn(TILE, "space-y-3")}>
          <Skeleton className="h-5 w-32 rounded-apple-sm" />
          <Skeleton className="h-4 w-full rounded-apple-sm" />
          <Skeleton className="h-4 w-3/4 rounded-apple-sm" />
        </div>
      </div>
    </div>
  );
}
