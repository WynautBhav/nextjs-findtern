import { Skeleton } from "@/components/ui/skeleton";

export default function EmployerLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading employer dashboard">
      {/* Hero command card */}
      <div className="rounded-[20px] border border-ink-200/70 bg-white p-5 sm:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl space-y-2">
            <Skeleton className="h-8 w-64 rounded-lg" />
            <Skeleton className="h-4 w-full max-w-md rounded-md" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-11 w-40 rounded-[10px]" />
            <Skeleton className="h-11 w-36 rounded-[10px]" />
          </div>
        </div>
      </div>

      {/* 3 quiet stats */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[20px] border border-ink-200/70 bg-ink-100">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white p-3 sm:p-5 space-y-2 sm:space-y-3"
          >
            <Skeleton className="h-3.5 w-24 rounded-md" />
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-3.5 w-28 rounded-md" />
          </div>
        ))}
      </div>

      {/* Main grid: projects + candidates rail */}
      <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="min-w-0 space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-44 rounded-md" />
              <Skeleton className="h-3.5 w-64 rounded-md" />
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[20px] border border-ink-200/70 bg-white p-5 space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-48 rounded-md" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-72 max-w-full rounded-md" />
              <div className="flex gap-1.5">
                <Skeleton className="h-6 w-16 rounded-md" />
                <Skeleton className="h-6 w-20 rounded-md" />
                <Skeleton className="h-6 w-14 rounded-md" />
              </div>
            </div>
          ))}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-3.5 w-56 rounded-md" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[20px] border border-ink-200/70 bg-white p-4 space-y-3"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-[10px]" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-28 rounded-md" />
                  <Skeleton className="h-3 w-24 rounded-md" />
                </div>
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
