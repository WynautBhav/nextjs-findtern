import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div  aria-busy="true" aria-label="Loading projects">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-2 h-5 w-72 max-w-full" />
      <div className="mt-8 border-t border-ink-300">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-8 border-b border-ink-200 py-5">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-6 w-2/3 max-w-sm" />
              <Skeleton className="h-4 w-1/2 max-w-xs" />
            </div>
            <Skeleton className="hidden h-11 w-40 lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
