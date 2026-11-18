import { Skeleton } from "@/components/ui/skeleton";

/** A ruled block under a heading: label and value rows on the page's hairlines. */
function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      <div className="mb-3 border-b border-ink-200 pb-2">
        <Skeleton className="h-6 w-32 rounded-md" />
      </div>
      <div className="divide-y divide-ink-200">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-6 py-3">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-4 w-1/3 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The proposal in its own shape: back link, the statement, the lead figure beside its quiet facts,
 * the money trail, then the terms; the next step in the side column (above them on a phone). Announced once.
 */
export default function EmployerProposalLoading() {
  return (
    <div role="status" aria-busy="true" className="pb-20 lg:pb-0">
      <span className="sr-only">Loading this proposal</span>
      <div className="mb-4 flex min-h-11 items-center">
        <Skeleton className="h-5 w-28 rounded-md" />
      </div>
      <Skeleton className="h-9 w-full max-w-xl rounded-md sm:h-11" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Skeleton className="h-6 w-28 rounded-md" />
        <Skeleton className="h-5 w-56 max-w-full rounded-md" />
      </div>

      <div className="mt-8 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
            <div className="space-y-3">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-11 w-48 rounded-md" />
              <Skeleton className="h-4 w-40 rounded-md" />
            </div>
            <div className="divide-y divide-ink-200 border-y border-ink-200">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <Skeleton className="h-4 w-24 rounded-md" />
                  <Skeleton className="h-5 w-16 rounded-md" />
                </div>
              ))}
            </div>
          </div>
          <RowsSkeleton rows={4} />
          <RowsSkeleton rows={6} />
        </div>
        <aside className="order-first space-y-10 lg:order-none">
          <div>
            <div className="mb-3 border-b border-ink-200 pb-2">
              <Skeleton className="h-6 w-24 rounded-md" />
            </div>
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="mt-2 h-4 w-2/3 rounded-md" />
            <Skeleton className="mt-4 h-11 w-full rounded-md" />
          </div>
        </aside>
      </div>
    </div>
  );
}
