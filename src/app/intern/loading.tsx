import { Skeleton } from "@/components/ui/skeleton";

export default function InternLoading() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-8 w-56 rounded-lg" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>

      {/* Top Banner / Readiness ring skeleton */}
      <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48 rounded-md" />
            <Skeleton className="h-4 w-80 rounded-md" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-8 w-32 rounded-lg" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="size-24 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-6 w-20 rounded-md" />
              <Skeleton className="h-3.5 w-32 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      {/* Grid of activities / opportunities skeleton */}
      <div className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-36 rounded-md" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-3/4 rounded-md" />
            <div className="flex items-center justify-between pt-2">
              <Skeleton className="h-3.5 w-24 rounded-md" />
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
