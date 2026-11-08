import { Skeleton } from "@/components/ui/skeleton";

export default function ThreadLoading() {
  return (
    <div aria-busy="true" aria-label="Loading conversation" className="space-y-3 rounded-apple-xl border border-ink-200 bg-white p-5">
      <Skeleton className="h-6 w-48 rounded-apple-sm" />
      <Skeleton className="h-16 w-3/4 rounded-apple-sm" />
      <Skeleton className="ml-auto h-12 w-2/3 rounded-apple-sm" />
      <Skeleton className="h-12 w-1/2 rounded-apple-sm" />
    </div>
  );
}
