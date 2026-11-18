import { Skeleton } from "@/components/ui/skeleton";

/** Fallback for one section of a tab: a heading rule and ruled rows, no card. Announced once to assistive tech. */
export function SectionSkeleton({ label = "Loading", height = "h-56", strip = false }: { label?: string; height?: string; strip?: boolean }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {strip ? (
        <div className="grid gap-x-14 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="space-y-3">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-11 w-40 rounded-md" />
            <Skeleton className="h-4 w-56 max-w-full rounded-md" />
          </div>
          <div className="space-y-2 border-y border-ink-200 py-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full rounded-md" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <Skeleton className="h-6 w-56 max-w-full rounded-md" />
          <Skeleton className={`mt-3 w-full rounded-md ${height}`} />
        </>
      )}
    </div>
  );
}
