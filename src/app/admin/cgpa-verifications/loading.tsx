import { Skeleton } from "@/components/ui/skeleton";

/** The queue's own loading shape: header, the lead strip, the filter tabs and three rows with an age column. Announced once. */
export default function CgpaVerificationsLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading the CGPA checks</span>
      <Skeleton className="mb-6 h-8 w-40 rounded-md" />
      <div className="mb-6 flex items-end gap-4 border-b border-ink-200 pb-5">
        <Skeleton className="h-10 w-14 rounded-md" />
        <Skeleton className="h-10 w-72 max-w-full rounded-md" />
      </div>
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-md" />
        ))}
      </div>
      <div className="divide-y divide-[color:var(--admin-rule)] rounded-lg bg-[color:var(--admin-panel)]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="grid gap-x-8 gap-y-3 px-5 py-5 lg:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1.3fr)]">
            <Skeleton className="h-10 w-20 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48 rounded-md" />
              <Skeleton className="h-4 w-64 max-w-full rounded-md" />
            </div>
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
