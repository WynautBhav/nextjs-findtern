import { Surface } from "@/components/app/primitives";
import { Skeleton } from "@/components/ui/skeleton";

/** A card of label/value rows under a title. */
function TermsSkeleton({ rows }: { rows: number }) {
  return (
    <Surface className="p-5 lg:p-6">
      <Skeleton className="h-6 w-32 rounded-apple-sm" />
      <div className="mt-3 divide-y divide-ink-100">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-6 py-3">
            <Skeleton className="h-4 w-28 rounded-apple-sm" />
            <Skeleton className="h-4 w-1/3 rounded-apple-sm" />
          </div>
        ))}
      </div>
    </Surface>
  );
}

/**
 * The proposal in its own shape: back link, the summary card (who and what, status, the four figures),
 * then the timeline and actions cards (above the terms on a phone) and the terms cards. Announced once.
 */
export default function EmployerProposalLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading this proposal</span>
      <div className="mb-4 flex min-h-11 items-center">
        <Skeleton className="h-5 w-28 rounded-apple-sm" />
      </div>

      <Surface className="mb-6 p-5 lg:p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="size-14 shrink-0 rounded-full" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-8 w-72 max-w-full rounded-apple-sm" />
            <Skeleton className="h-5 w-48 max-w-full rounded-apple-sm" />
          </div>
        </div>
        <Skeleton className="mt-4 h-8 w-32 rounded-full" />
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-ink-100 pt-5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <Skeleton className="h-5 w-24 rounded-apple-sm" />
              <Skeleton className="mt-1 h-7 w-28 rounded-apple-sm" />
            </div>
          ))}
        </div>
      </Surface>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <TermsSkeleton rows={4} />
          <TermsSkeleton rows={5} />
        </div>
        <Surface className="order-first p-5 lg:order-none lg:p-6">
          <Skeleton className="h-7 w-36 rounded-apple-sm" />
          <div className="mt-4 space-y-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3.5">
                <Skeleton className="mt-0.5 size-6 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32 rounded-apple-sm" />
                  <Skeleton className="h-4 w-24 rounded-apple-sm" />
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
}
