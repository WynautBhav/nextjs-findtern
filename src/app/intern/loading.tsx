import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading state for every intern screen: the page-head rhythm, then a main
 * column and a rail, in the same radius and border tokens as the real
 * surfaces so nothing jumps when the page lands.
 */
export default function InternLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="motion-safe:animate-pulse">
      <div className="mb-8 space-y-3">
        <Skeleton className="h-9 w-64 max-w-full rounded-apple-sm" />
        <Skeleton className="h-5 w-96 max-w-full rounded-apple-sm" />
      </div>

      <div className="grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-apple-xl border border-ink-200/80 bg-white p-6 shadow-xs">
              <Skeleton className="h-5 w-48 rounded-apple-sm" />
              <Skeleton className="h-4 w-full rounded-apple-sm" />
              <Skeleton className="h-4 w-3/4 rounded-apple-sm" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-apple-xl border border-ink-200/80 bg-white p-5 shadow-xs">
              <Skeleton className="h-4 w-28 rounded-apple-sm" />
              <Skeleton className="h-7 w-20 rounded-apple-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
