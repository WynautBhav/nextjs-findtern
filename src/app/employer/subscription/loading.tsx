import { SURFACE_CLASS } from "@/components/app/primitives";
import { Skeleton } from "@/components/ui/skeleton";

/** The plan card and the status card, in their places: the shell stays put while the page reads. */
export default function SubscriptionLoading() {
  return (
    <div aria-busy="true">
      <div className="mb-6 space-y-3 lg:mb-8">
        <Skeleton className="h-8 w-44 max-w-full rounded-apple-sm" />
        <Skeleton className="h-4 w-72 max-w-full rounded-apple-sm" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-8">
        <div className={`${SURFACE_CLASS} space-y-4 p-5 sm:p-8`}>
          <Skeleton className="h-6 w-28 rounded-apple-sm" />
          <Skeleton className="h-9 w-48 rounded-apple-sm" />
          <Skeleton className="h-5 w-64 max-w-full rounded-apple-sm" />
          <Skeleton className="h-5 w-56 max-w-full rounded-apple-sm" />
          <Skeleton className="mt-6 h-11 w-full rounded-apple-sm" />
        </div>
        <div className={`${SURFACE_CLASS} space-y-3 p-5 max-xl:order-first`}>
          <Skeleton className="h-6 w-40 rounded-apple-sm" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-4 w-full rounded-apple-sm" />
        </div>
      </div>
      <span className="sr-only">Loading your subscription</span>
    </div>
  );
}
