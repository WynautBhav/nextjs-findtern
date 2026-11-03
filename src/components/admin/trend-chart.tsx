import { LineDuo } from "@/components/admin/charts/line-duo";
import { cn } from "@/lib/utils";

/**
 * Trend chart: six months of proposals sent (solid line) and interviews
 * booked (dashed amber), drawn by the shared `LineDuo`. The dash is the
 * non-colour channel, so the two stay apart in greyscale; both series are
 * named in its legend and in its screen-reader table.
 */

export type TrendPoint = {
  label: string;
  proposals: number;
  interviews: number;
};

export function TrendChart({ data, className, height = 220 }: { data: TrendPoint[]; className?: string; height?: number }) {
  if (data.length < 2) {
    return (
      <p className="py-12 text-center text-sm text-text-subtle">
        Not enough activity to chart yet - at least two months are needed.
      </p>
    );
  }
  return (
    <LineDuo
      className={className}
      height={height}
      ariaLabel={`Proposals sent and interviews booked over the last ${data.length} months`}
      series={[
        { label: "Proposals", tone: "current", points: data.map((d) => ({ x: d.label, y: d.proposals })) },
        { label: "Interviews", tone: "previous", points: data.map((d) => ({ x: d.label, y: d.interviews })) },
      ]}
    />
  );
}

/**
 * Pipeline bars - one horizontal bar per status, in a fixed declared order.
 *
 * Not sorted by count: "sent" is always first and "withdrawn" always last, so
 * the widget does not reshuffle itself every time a proposal changes state.
 */
export function PipelineBars({
  items,
  className,
  percentOf = "total",
}: {
  items: { status: string; count: number; label?: string }[];
  className?: string;
  /**
   * What the percentage is of: the sum of all bars (a status breakdown), the
   * first bar (a funnel: share of the people who started), or nothing.
   */
  percentOf?: "total" | "first" | "none";
}) {
  const base =
    percentOf === "first" ? (items[0]?.count ?? 0) : percentOf === "total" ? items.reduce((sum, item) => sum + item.count, 0) : 0;
  const max = Math.max(1, ...items.map((item) => item.count));

  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {items.map((item) => (
        <li key={item.status}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">
              {item.label ?? item.status}
            </span>
            <span className="nums shrink-0 font-semibold text-foreground">
              {item.count.toLocaleString("en-IN")}
              {base > 0 ? (
                <span className="ml-1.5 font-normal text-text-subtle">
                  {Math.round((item.count / base) * 100)}%
                </span>
              ) : null}
            </span>
          </div>
          <div
            aria-hidden
            className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--admin-panel-2)]"
          >
            <div
              className={cn(
                "h-full rounded-full bg-[color:var(--admin-tile)]",
                "motion-safe:transition-[width] motion-safe:duration-500",
              )}
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
