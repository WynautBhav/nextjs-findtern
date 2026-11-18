import { Skeleton } from "@/components/ui/skeleton";

/** The ledger's own shape in its places: the lead figure and its ruled list, the tabs, then rows. */
export default function OrdersLoading() {
  return (
    <div aria-busy="true">
      <div className="mb-8 space-y-3">
        <Skeleton className="h-8 w-28 max-w-full rounded-md" />
        <Skeleton className="h-4 w-72 max-w-full rounded-md" />
      </div>
      <div className="mb-10 grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="space-y-3">
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="h-12 w-56 rounded-md" />
          <Skeleton className="h-2 w-full max-w-sm rounded-md" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
      <Skeleton className="mb-6 h-8 w-64 max-w-full rounded-md" />
      <div className="space-y-6">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-md motion-reduce:animate-none" />
        ))}
      </div>
      <span className="sr-only">Loading your orders</span>
    </div>
  );
}
