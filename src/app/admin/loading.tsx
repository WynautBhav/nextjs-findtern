import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shape every admin page shares: a title row, then rows. It does not draw a
 * KPI strip or icon chips (most pages have neither), so a list page no longer
 * flashes a dashboard on its way in. Announced once to assistive tech
 * (`role="status"` with a screen-reader label). This is the generic fallback;
 * a redesigned page ships its own `loading.tsx` in the page's own shape.
 */
export default function AdminLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading this page</span>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Skeleton className="h-7 w-48 rounded-apple-sm" />
          <Skeleton className="h-4 w-72 max-w-full rounded-apple-sm" />
        </div>
        <Skeleton className="h-9 w-32 rounded-apple-sm" />
      </div>

      <div className="rounded-apple-xl border border-ink-200/80 bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-ink-200/80 p-4">
          <Skeleton className="h-9 w-56 max-w-full rounded-apple-sm" />
          <Skeleton className="hidden h-9 w-24 rounded-apple-sm sm:block" />
        </div>
        <div className="divide-y divide-ink-200/80">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-4 w-40 rounded-apple-sm" />
              <Skeleton className="ml-auto h-4 w-24 rounded-apple-sm" />
              <Skeleton className="hidden h-4 w-28 rounded-apple-sm md:block" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
