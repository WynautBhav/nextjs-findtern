import { Skeleton } from "@/components/ui/skeleton";

/** One notification as the list draws it: unread dot, a title with its time, and the message under it. */
function NotificationRowSkeleton({ wide }: { wide: boolean }) {
  return (
    <li className="flex items-start gap-4 py-4 pl-3 pr-14">
      <Skeleton className="mt-2 size-2 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-4">
          <Skeleton className="h-5 w-2/5 rounded-apple-sm" />
          <Skeleton className="h-4 w-14 shrink-0 rounded-apple-sm" />
        </div>
        <Skeleton className={`mt-2 h-4 rounded-apple-sm ${wide ? "w-full" : "w-3/4"}`} />
        <Skeleton className="mt-1.5 h-4 w-1/2 rounded-apple-sm" />
      </div>
    </li>
  );
}

/** The notifications list in its own shape: head with the mark-all action, then dated groups of rows. Announced once. */
export default function InternNotificationsLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading your notifications</span>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
        <div className="min-w-0 max-w-3xl space-y-1">
          <Skeleton className="h-8 w-48 rounded-apple-sm lg:h-[2.625rem]" />
          <Skeleton className="h-6 w-80 max-w-full rounded-apple-sm" />
        </div>
        <Skeleton className="h-11 w-full rounded-apple-md sm:w-48" />
      </div>

      <div className="space-y-8">
        {[4, 3].map((rows, g) => (
          <section key={g}>
            <Skeleton className="mb-2 ml-3 h-4 w-24 rounded-apple-sm" />
            <ul className="divide-y divide-ink-200 border-y border-ink-200">
              {Array.from({ length: rows }, (_, i) => (
                <NotificationRowSkeleton key={i} wide={i % 2 === 0} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
