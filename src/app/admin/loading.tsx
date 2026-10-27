import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-48 rounded-apple-sm" />
          <Skeleton className="h-4 w-72 rounded-apple-sm" />
        </div>
        <Skeleton className="h-9 w-32 rounded-apple-sm" />
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-apple-lg border border-ink-200/80 bg-white p-5 shadow-2xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24 rounded-apple-sm" />
              <Skeleton className="size-8 rounded-apple-sm" />
            </div>
            <Skeleton className="h-7 w-20 rounded-apple-sm" />
            <Skeleton className="h-3 w-32 rounded-apple-sm" />
          </div>
        ))}
      </div>

      {/* Content panel skeleton */}
      <div className="rounded-apple-lg border border-ink-200/80 bg-white p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-ink-100 pb-4">
          <Skeleton className="h-5 w-40 rounded-apple-sm" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-52 rounded-apple-sm" />
            <Skeleton className="h-9 w-24 rounded-apple-sm" />
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-ink-50 last:border-0">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-36 rounded-apple-sm" />
                  <Skeleton className="h-3 w-48 rounded-apple-sm" />
                </div>
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-4 w-28 rounded-apple-sm hidden md:block" />
              <Skeleton className="h-8 w-16 rounded-apple-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
