import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container-page section-y space-y-4" aria-busy="true" aria-label="Loading projects">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-11 w-full max-w-md" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
