import { Skeleton } from "@/components/ui/skeleton";

/**
 * The loading shape for the pages that list candidates as rows (Shortlist,
 * Compare): a title block, then four divided rows with a round photo, two text
 * bars and chips. Same anatomy as `candidates/loading.tsx`, no boxes. The pulse
 * stops under reduced motion.
 */
export function CandidateRowsSkeleton({ label }: { label: string }) {
  const bar = "motion-reduce:animate-none";
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <Skeleton className={`mb-4 h-8 w-44 rounded-apple-sm lg:mb-6 ${bar}`} />
      <ul className="divide-y divide-ink-100 border-t border-ink-100">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3.5 gap-y-3 py-5 sm:gap-x-5 sm:py-6">
            <Skeleton className={`size-12 rounded-full sm:size-14 ${bar}`} />
            <div className="min-w-0 space-y-2">
              <Skeleton className={`h-4 w-10 rounded-apple-sm ${bar}`} />
              <Skeleton className={`h-5 w-64 max-w-full rounded-apple-sm ${bar}`} />
              <Skeleton className={`h-3.5 w-24 rounded-apple-sm ${bar}`} />
            </div>
            <Skeleton className={`size-11 rounded-full sm:h-9 sm:w-36 ${bar}`} />
            <div className="col-span-3 space-y-3 sm:col-span-2 sm:col-start-2">
              <Skeleton className={`h-4 w-72 max-w-full rounded-apple-sm ${bar}`} />
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 4 }).map((__, j) => (
                  <Skeleton key={j} className={`h-7 w-20 rounded-full ${bar}`} />
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
