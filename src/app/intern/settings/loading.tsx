import { SURFACE_CLASS } from "@/components/app/primitives";
import { Skeleton } from "@/components/ui/skeleton";

/** Settings in its own shape: title, the section chips, then a card per section with a couple of fields. Announced once. */
export default function InternSettingsLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading your settings</span>
      <Skeleton className="mb-6 h-8 w-40 rounded-apple-sm lg:mb-8" />
      <div className="-mt-2 mb-8 flex flex-wrap gap-2">
        {[88, 104, 72, 72, 104, 80, 88].map((w, i) => (
          <Skeleton key={i} className="h-11 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          {[2, 1, 2].map((fields, s) => (
            <section key={s}>
              <Skeleton className="h-6 w-40 rounded-apple-sm" />
              <Skeleton className="mb-4 mt-2 h-4 w-64 max-w-full rounded-apple-sm" />
              <div className={`${SURFACE_CLASS} space-y-5 p-5 lg:p-6`}>
                {Array.from({ length: fields }, (_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-28 rounded-apple-sm" />
                    <Skeleton className="h-11 w-full rounded-apple-md" />
                  </div>
                ))}
                <Skeleton className="h-11 w-36 rounded-apple-md" />
              </div>
            </section>
          ))}
        </div>
        <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {[0, 1].map((i) => (
            <div key={i} className={`${SURFACE_CLASS} space-y-3 p-5`}>
              <Skeleton className="h-5 w-32 rounded-apple-sm" />
              <Skeleton className="h-4 w-full rounded-apple-sm" />
              <Skeleton className="h-4 w-2/3 rounded-apple-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
