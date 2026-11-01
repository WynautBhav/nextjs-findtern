import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while any employer screen loads. Shaped like the dashboard, the most
 * common landing: a hero band, then a list, so the frame doesn't jump when
 * the real page arrives. The shell (sidebar, top bar) stays put.
 */
export default function EmployerLoading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="mb-8 space-y-4 rounded-apple-xl border border-ink-200/80 bg-white px-6 py-8 sm:px-9 sm:py-10">
        <Skeleton className="h-9 w-64 max-w-full rounded-apple-sm" />
        <Skeleton className="h-5 w-[28rem] max-w-full rounded-apple-sm" />
      </div>

      <div className="divide-y divide-ink-100 overflow-hidden rounded-apple-xl border border-ink-200/80 bg-white">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-48 max-w-full rounded-apple-sm" />
              <Skeleton className="h-3.5 w-72 max-w-full rounded-apple-sm" />
            </div>
            <Skeleton className="hidden h-9 w-28 rounded-apple-sm sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
