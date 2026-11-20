import { Skeleton } from "@/components/ui/skeleton";

/** The queue's own loading shape: header, four filter pills and three meeting cards. Announced once. */
export default function MeetingReviewsLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading the meeting reviews</span>
      <div className="mb-6 space-y-2 lg:mb-8">
        <Skeleton className="h-9 w-56 rounded-apple-sm" />
        <Skeleton className="h-5 w-full max-w-sm rounded-apple-sm" />
      </div>
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-28 rounded-full" />
        ))}
      </div>
      <div className="divide-y divide-[color:var(--admin-rule)] rounded-[var(--radius-admin-card)] bg-[color:var(--admin-panel)]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 px-5 py-5">
            <Skeleton className="h-5 w-64 max-w-full rounded-apple-sm" />
            <Skeleton className="h-4 w-80 max-w-full rounded-apple-sm" />
            <Skeleton className="h-16 w-full rounded-apple-sm" />
            <Skeleton className="h-11 w-56 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
