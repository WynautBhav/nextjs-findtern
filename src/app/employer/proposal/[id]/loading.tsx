import { Skeleton } from "@/components/ui/skeleton";

/** A section of label/value rows under a title, with the page's hairlines. */
function TermsSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      <Skeleton className="h-6 w-32 rounded-apple-sm" />
      <div className="mt-2 divide-y divide-ink-100 border-b border-ink-100">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-6 py-3">
            <Skeleton className="h-4 w-28 rounded-apple-sm" />
            <Skeleton className="h-4 w-1/3 rounded-apple-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The proposal in its own shape: back link, who and what with the one action, the four figures the
 * decision rests on, then the terms beside the offer timeline (above them on a phone). Announced once.
 */
export default function EmployerProposalLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading this proposal</span>
      <div className="mb-4 flex min-h-11 items-center">
        <Skeleton className="h-5 w-28 rounded-apple-sm" />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Skeleton className="size-14 shrink-0 rounded-full" />
          <div className="min-w-0 space-y-3">
            <Skeleton className="h-5 w-48 max-w-full rounded-apple-sm" />
            <Skeleton className="h-8 w-72 max-w-full rounded-apple-sm sm:h-9" />
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-5 w-32 rounded-apple-sm" />
            </div>
          </div>
        </div>
        <Skeleton className="h-11 w-full rounded-apple-md sm:w-36 lg:shrink-0" />
      </div>

      <div className="mt-8 grid grid-cols-2 border-y border-ink-100 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={[
              "py-5 sm:px-6 sm:first:pl-0",
              i % 2 === 1 ? "border-l border-ink-100 pl-5" : "",
              i >= 2 ? "border-t border-ink-100 sm:border-t-0" : "",
              i === 2 ? "sm:border-l sm:pl-6" : "",
            ].join(" ")}
          >
            <Skeleton className="h-5 w-24 rounded-apple-sm" />
            <Skeleton className="mt-1 h-8 w-28 rounded-apple-sm" />
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          <TermsSkeleton rows={4} />
          <TermsSkeleton rows={7} />
          <div>
            <Skeleton className="h-6 w-48 rounded-apple-sm" />
            <div className="mt-3 max-w-prose space-y-2">
              <Skeleton className="h-4 w-full rounded-apple-sm" />
              <Skeleton className="h-4 w-full rounded-apple-sm" />
              <Skeleton className="h-4 w-2/3 rounded-apple-sm" />
            </div>
          </div>
        </div>

        <div className="order-first lg:order-none">
          <Skeleton className="h-6 w-36 rounded-apple-sm" />
          <div className="mt-4 space-y-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-3.5">
                <Skeleton className="mt-0.5 size-6 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32 rounded-apple-sm" />
                  <Skeleton className="h-4 w-24 rounded-apple-sm" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
