import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the page it stands in for, so nothing jumps when it lands: the
 * heading, the green tab strip, the skill line, then the white card with a
 * header of candidate columns and a few metric rows. Same radii, borders and
 * spacing as the real card, and as `candidates/loading.tsx`.
 */
export default function CompareLoading() {
  const cols = 3;
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading the comparison
      </span>
      <Skeleton className="mb-4 h-8 w-56 rounded-apple-sm motion-reduce:animate-none lg:mb-5" />
      <Skeleton className="mb-4 h-12 w-full rounded-xl motion-reduce:animate-none sm:mb-5" />
      <div className="mb-4 flex gap-2 lg:mb-5">
        <Skeleton className="h-7 w-20 rounded-lg motion-reduce:animate-none" />
        <Skeleton className="h-7 w-24 rounded-lg motion-reduce:animate-none" />
        <Skeleton className="h-7 w-16 rounded-lg motion-reduce:animate-none" />
      </div>
      <Skeleton className="mb-3 h-5 w-32 rounded-apple-sm motion-reduce:animate-none" />
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xs">
        <div className="grid grid-cols-[6rem_repeat(3,minmax(0,1fr))] sm:grid-cols-[9rem_repeat(3,minmax(0,1fr))] xl:grid-cols-[11rem_repeat(3,minmax(0,1fr))]">
          <div className="border-b border-r border-ink-200 p-3 sm:p-4 xl:p-5" />
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="space-y-3 border-b border-r border-ink-200 p-3 last:border-r-0 sm:p-4 xl:p-5">
              <Skeleton className="size-12 rounded-2xl motion-reduce:animate-none sm:size-14" />
              <Skeleton className="h-5 w-16 rounded-apple-sm motion-reduce:animate-none" />
              <Skeleton className="h-4 w-24 max-w-full rounded-apple-sm motion-reduce:animate-none" />
              <Skeleton className="h-10 w-full rounded-xl motion-reduce:animate-none sm:w-36" />
            </div>
          ))}
          {Array.from({ length: 4 }).map((_, r) => (
            <div key={r} className="contents">
              <div className="border-b border-r border-ink-200 p-3 sm:p-4 xl:p-5">
                <Skeleton className="h-4 w-16 rounded-apple-sm motion-reduce:animate-none" />
              </div>
              {Array.from({ length: cols }).map((__, i) => (
                <div key={i} className="space-y-2 border-b border-r border-ink-200 p-3 last:border-r-0 sm:p-4 xl:p-5">
                  <Skeleton className="h-6 w-16 rounded-apple-sm motion-reduce:animate-none" />
                  <Skeleton className="h-1.5 w-full rounded-full motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
