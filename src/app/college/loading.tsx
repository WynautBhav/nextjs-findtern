import { Skeleton } from "@/components/ui/skeleton";

/** Shaped like the college screens: a heading, one lead figure, then a ruled list. */
export default function CollegeLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-3 border-t border-ink-200 pt-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-11 w-44" />
        <Skeleton className="h-2.5 w-full max-w-sm" />
      </div>
      <div className="divide-y divide-ink-200 border-y border-ink-200">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-3.5">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
