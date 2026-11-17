import { Skeleton } from "@/components/ui/skeleton";

/** The queue's own loading shape: header, search, four filter pills and three check cards. Announced once. */
export default function CgpaVerificationsLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading the CGPA checks</span>
      <div className="mb-6 space-y-2 lg:mb-8">
        <Skeleton className="h-9 w-40 rounded-apple-sm" />
        <Skeleton className="h-5 w-full max-w-xl rounded-apple-sm" />
      </div>
      <Skeleton className="mb-4 h-11 w-full max-w-md rounded-full" />
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-24 rounded-full" />
        ))}
      </div>
      <div className="divide-y divide-[color:var(--admin-rule)] rounded-[var(--radius-admin-card)] bg-[color:var(--admin-panel)]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 px-5 py-5">
            <Skeleton className="h-5 w-48 rounded-apple-sm" />
            <Skeleton className="h-4 w-72 max-w-full rounded-apple-sm" />
            <div className="flex gap-3">
              <Skeleton className="h-16 w-24 rounded-apple-sm" />
              <Skeleton className="h-16 w-24 rounded-apple-sm" />
              <Skeleton className="h-16 w-24 rounded-apple-sm" />
            </div>
            <Skeleton className="h-11 w-48 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
