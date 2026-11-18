import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the page it stands in for, so nothing jumps when it lands: the
 * heading, the tab line, the skill line, then the ruled matrix with a header
 * of candidate columns and a few metric rows. Same rules and spacing as the
 * real table, and as `candidates/loading.tsx`.
 */
export default function CompareLoading() {
  const cols = 3;
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading the comparison
      </span>
      <Skeleton className="mb-4 h-8 w-56 rounded-md motion-reduce:animate-none lg:mb-5" />
      <Skeleton className="mb-6 h-11 w-72 rounded-md motion-reduce:animate-none" />
      <div className="mb-4 flex gap-2 lg:mb-5">
        <Skeleton className="h-7 w-20 rounded-md motion-reduce:animate-none" />
        <Skeleton className="h-7 w-24 rounded-md motion-reduce:animate-none" />
        <Skeleton className="h-7 w-16 rounded-md motion-reduce:animate-none" />
      </div>
      <div className="border-b border-ink-300">
        <div className="grid grid-cols-[7rem_repeat(3,minmax(0,1fr))] sm:grid-cols-[10rem_repeat(3,minmax(0,1fr))] xl:grid-cols-[11rem_repeat(3,minmax(0,1fr))]">
          <div className="border-b border-ink-300" />
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="space-y-3 border-b border-ink-300 px-3 pb-4 pt-2 sm:px-4 xl:px-5">
              <Skeleton className="size-12 rounded-full motion-reduce:animate-none" />
              <Skeleton className="h-6 w-16 rounded-md motion-reduce:animate-none" />
              <Skeleton className="h-4 w-24 max-w-full rounded-md motion-reduce:animate-none" />
              <Skeleton className="h-11 w-full rounded-md motion-reduce:animate-none sm:w-36" />
            </div>
          ))}
          {Array.from({ length: 4 }).map((_, r) => (
            <div key={r} className="contents">
              <div className="border-b border-ink-200 py-4 pr-3">
                <Skeleton className="h-4 w-16 rounded-md motion-reduce:animate-none" />
              </div>
              {Array.from({ length: cols }).map((__, i) => (
                <div key={i} className="space-y-2 border-b border-ink-200 px-3 py-4 sm:px-4 xl:px-5">
                  <Skeleton className="h-7 w-16 rounded-md motion-reduce:animate-none" />
                  <Skeleton className="h-1 w-full rounded-sm motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
