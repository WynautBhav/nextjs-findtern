import { Skeleton } from "@/components/ui/skeleton";

/** The page's own shape, in its places: the plan figure and its ruled list on the left, the status on the right. */
export default function SubscriptionLoading() {
  return (
    <div aria-busy="true">
      <div className="mb-6 space-y-3 lg:mb-8">
        <Skeleton className="h-8 w-44 max-w-full rounded-md" />
        <Skeleton className="h-4 w-72 max-w-full rounded-md" />
      </div>
      <div className="grid gap-x-14 gap-y-10 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Skeleton className="h-4 w-20 rounded-md" />
          <Skeleton className="h-12 w-56 rounded-md" />
          <Skeleton className="h-5 w-64 max-w-full rounded-md" />
          <Skeleton className="mt-8 h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="mt-6 h-11 w-full max-w-xl rounded-md" />
        </div>
        <div className="space-y-3 max-xl:order-first">
          <Skeleton className="h-6 w-40 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-4 w-full rounded-md" />
        </div>
      </div>
      <span className="sr-only">Loading your subscription</span>
    </div>
  );
}
