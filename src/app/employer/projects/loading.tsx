import { Surface } from "@/components/app/primitives";
import { Skeleton } from "@/components/ui/skeleton";

/** Same shape as the loaded page: head (count, title, lede, button), the status strip, then project cards. */
export default function Loading() {
  return (
    <div className="container-page section-y" aria-busy="true" aria-label="Loading projects">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-11 w-full sm:w-44" />
      </div>
      <div className="space-y-4">
        <div className="@container">
          <div className="flex flex-wrap gap-2 @xl:grid @xl:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] @xl:gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Surface key={i} className="flex min-h-[4.75rem] min-w-0 flex-1 basis-[6.5rem] flex-col items-start gap-1 p-3 @xl:basis-auto @xl:p-5">
                <Skeleton className="h-6 w-8" />
                <Skeleton className="h-5 w-12" />
              </Surface>
            ))}
          </div>
          <Skeleton className="mt-3 h-5 w-48" />
        </div>
        <ul className="grid gap-4">
          {[0, 1, 2].map((i) => (
            <Surface key={i} as="li" className="@container p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-56 max-w-[70%]" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-2.5 h-4 w-64 max-w-full" />
              <div className="mt-3 flex gap-1.5">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t border-ink-100 pt-4 @xl:flex-row @xl:items-center @xl:justify-between">
                <Skeleton className="h-9 w-full @xl:max-w-xs" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-11 flex-1 @xl:w-40 @xl:flex-none" />
                  <Skeleton className="size-11" />
                </div>
              </div>
            </Surface>
          ))}
        </ul>
      </div>
    </div>
  );
}
