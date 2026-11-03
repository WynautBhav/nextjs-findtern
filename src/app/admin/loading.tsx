import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shape every admin page shares: a title row, then one white panel of rows.
 * It does not draw a KPI strip or icon chips (most pages have neither), so a
 * list page no longer flashes a dashboard on its way in. Announced once to
 * assistive tech (`role="status"` with a screen-reader label). This is the
 * generic fallback; a redesigned page ships its own `loading.tsx` in the
 * page's own shape.
 */
export default function AdminLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading this page</span>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Skeleton className="h-8 w-48 rounded-full" />
          <Skeleton className="h-4 w-72 max-w-full rounded-full" />
        </div>
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>

      <div className="rounded-[var(--radius-admin-card)] border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)]">
        <div className="flex items-center justify-between gap-3 p-[var(--admin-pad-panel)]">
          <Skeleton className="h-10 w-56 max-w-full rounded-full" />
          <Skeleton className="hidden h-10 w-24 rounded-full sm:block" />
        </div>
        <div className="divide-y divide-[color:var(--admin-rule)]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-[var(--admin-pad-panel)] py-3.5">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-40 rounded-full" />
              <Skeleton className="ml-auto h-4 w-24 rounded-full" />
              <Skeleton className="hidden h-4 w-28 rounded-full md:block" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
