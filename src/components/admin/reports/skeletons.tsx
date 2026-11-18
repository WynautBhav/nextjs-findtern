import { Skeleton } from "@/components/ui/skeleton";

/** Fallback for one section of a tab: a title line and a block. Announced once to assistive tech. */
export function SectionSkeleton({ label = "Loading", height = "h-56", strip = false }: { label?: string; height?: string; strip?: boolean }) {
  return (
    <div role="status" aria-busy="true" className="rounded-[var(--radius-admin-card)] border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] p-[var(--admin-pad-panel)] shadow-[var(--admin-shadow)]">
      <span className="sr-only">{label}</span>
      {strip ? (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="h-8 w-28 rounded-full" />
              <Skeleton className="h-3 w-32 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <Skeleton className="h-5 w-56 max-w-full rounded-full" />
          <Skeleton className={`mt-4 w-full rounded-2xl ${height}`} />
        </>
      )}
    </div>
  );
}
