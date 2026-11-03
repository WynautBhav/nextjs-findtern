import { cn } from "@/lib/utils";

export type Stat = {
  label: string;
  value: string;
  /** One line saying what the figure counts. */
  note?: string;
  /** Change vs the previous period, e.g. "+12%" or "\u22123%"; omit when there is no base. */
  delta?: string;
  /** Used only to colour the delta. */
  trend?: "up" | "down" | "flat";
  /** The one figure per strip that carries the brand accent. */
  accent?: boolean;
  /** A loss: drawn in ink with an "Out" tag, never the accent. */
  negative?: boolean;
};

/**
 * One white card, figures divided by hairlines: the strip under a report's
 * title. Figures size to their cell (container query) and never wrap, so a
 * long rupee amount fits instead of being cut.
 */
export function StatStrip({ stats, label = "Key figures" }: { stats: Stat[]; label?: string }) {
  const n = stats.length;
  return (
    <section
      aria-label={label}
      data-rp="strip"
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-[var(--radius-admin-card)] border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] shadow-[var(--admin-shadow)]",
        n >= 5 ? "xl:grid-cols-5" : n === 3 ? "sm:grid-cols-3" : "xl:grid-cols-4",
      )}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          className="min-w-0 border-b border-r border-[color:var(--admin-rule)] p-4 [container-type:inline-size] sm:p-5 [&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r xl:border-b-0 xl:last:border-r-0"
        >
          <p className="text-sm font-medium text-text-subtle">{s.label}</p>
          <p
            className={cn(
              "nums mt-2 whitespace-nowrap font-semibold leading-[1.1] tracking-[-0.03em] text-[clamp(1.375rem,11cqi,2.25rem)]",
              s.accent && !s.negative ? "text-[color:var(--admin-tile)]" : "text-foreground",
            )}
          >
            {s.value}
          </p>
          {s.negative ? (
            <span className="mt-1 inline-flex rounded-full bg-accent-500/15 px-2 py-0.5 text-xs font-semibold text-foreground">Out</span>
          ) : null}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] leading-snug text-text-subtle">
            {s.delta ? (
              <span
                className={cn(
                  "nums inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                  s.trend === "up" && "bg-success/10 text-success",
                  s.trend === "down" && "bg-danger/10 text-danger",
                  (!s.trend || s.trend === "flat") && "bg-[color:var(--admin-panel-2)] text-text-subtle",
                )}
              >
                {s.delta}
                <span className="sr-only"> compared with the previous period</span>
              </span>
            ) : null}
            {s.note ? <span>{s.note}</span> : null}
          </p>
        </div>
      ))}
    </section>
  );
}

/** Colour direction for a delta given a percent change (null when unknown). */
export function trendOf(pct: number | null): Stat["trend"] {
  return pct === null || pct === 0 ? "flat" : pct > 0 ? "up" : "down";
}
