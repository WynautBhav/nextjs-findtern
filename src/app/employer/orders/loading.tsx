import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the page it stands in for, so nothing jumps when it lands: the
 * heading, the green tab strip, the summary card, then the toolbar and list
 * card. Same radii, borders and spacing as the real page, and as
 * `compare/loading.tsx`.
 */
export default function OrdersLoading() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading your orders
      </span>
      <Skeleton className="mb-1 h-10 w-40 rounded-apple-sm motion-reduce:animate-none" />
      <Skeleton className="mb-3 h-5 w-72 max-w-full rounded-apple-sm motion-reduce:animate-none sm:mb-4 lg:mb-5" />
      <Skeleton className="mb-4 h-12 w-full rounded-xl motion-reduce:animate-none sm:mb-5" />
      <div className="mb-4 rounded-2xl border border-ink-200 bg-white p-4 shadow-xs sm:mb-5 sm:p-5 lg:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-20 rounded-apple-sm motion-reduce:animate-none" />
            <Skeleton className="h-10 w-48 rounded-apple-sm motion-reduce:animate-none" />
            <Skeleton className="h-8 w-44 rounded-full motion-reduce:animate-none" />
          </div>
          <Skeleton className="h-24 w-full rounded-xl motion-reduce:animate-none" />
        </div>
      </div>
      <Skeleton className="mb-4 h-[4.5rem] w-full rounded-2xl motion-reduce:animate-none" />
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xs">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-ink-100 p-4 last:border-b-0">
            <Skeleton className="size-10 shrink-0 rounded-full motion-reduce:animate-none" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 max-w-full rounded-apple-sm motion-reduce:animate-none" />
              <Skeleton className="h-3.5 w-56 max-w-full rounded-apple-sm motion-reduce:animate-none" />
            </div>
            <Skeleton className="hidden h-9 w-24 rounded-lg motion-reduce:animate-none sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
