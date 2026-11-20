import { Tile } from "@/components/app/tiles";
import { cn } from "@/lib/utils";

import type { TopLayout } from "./home-layout";

/**
 * Home's top band. Pass the layout from `homeTopLayout` (the page needs its `wide` flag for the What next card).
 * The `@container` wrapper is what the layout's `@xl` / `@4xl` classes measure.
 */
export function HomeTop({
  layout,
  waiting,
  nextUp,
  chart,
}: {
  layout: TopLayout;
  waiting: React.ReactNode;
  nextUp: React.ReactNode;
  /** The hours chart; wrapped in its card here. */
  chart: React.ReactNode;
}) {
  return (
    <div className="@container">
      <div className={layout.root}>
        {waiting ? <div className={cn("flex min-w-0 flex-col [&>section]:flex-1", layout.waiting)}>{waiting}</div> : null}
        {nextUp ? <div className={cn("flex min-w-0 flex-col [&>section]:flex-1", layout.nextUp)}>{nextUp}</div> : null}
        {chart ? (
          <div className={cn("flex min-w-0 flex-col [&>section]:flex-1", layout.chart)}>
            <Tile title="Hours by month" action={{ href: "/intern/timesheets", label: "Timesheets" }}>
              {chart}
            </Tile>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Activity beside the narrow facts. The split follows the page column, not the window. Fact tiles keep their own
 * height (`items-start`): a toggle never stretches to the height of an interview card beside it.
 */
export function HomeLower({ activity, aside }: { activity: React.ReactNode; aside: React.ReactNode }) {
  return (
    <div className="@container">
      <div className="grid gap-4 @4xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="grid min-w-0 content-start gap-4">{activity}</div>
        <aside className="grid min-w-0 content-start items-start gap-4 @xl:grid-cols-2 @xl:[&>:last-child:nth-child(odd)]:col-span-2 @4xl:grid-cols-1 @4xl:[&>:last-child:nth-child(odd)]:col-span-1">
          {aside}
        </aside>
      </div>
    </div>
  );
}
