import type { LucideIcon } from "lucide-react";

import { Count } from "@/components/admin/motion";
import { ArrowLinkButton } from "@/components/admin/panel";
import { cn } from "@/lib/utils";

export type StatTone = "brand" | "accent" | "info" | "success" | "warning" | "neutral";

/**
 * A KPI tile: a rounded panel with a small grey label (and a round arrow link
 * when `href` is given), a 40-44px figure, and a one-line caption naming the
 * baseline. `featured` fills it with the brand tile colour. The tone marks a
 * figure that needs someone (warning) with a dot by its label; `icon` is
 * accepted for old callers and not drawn.
 */
const DOT: Partial<Record<StatTone, string>> = {
  warning: "bg-accent-500",
  accent: "bg-accent-500",
};

/**
 * Which way a delta string points: "+12 this week" up, "-3 vs last month"
 * down, "0 this week" (or no sign) flat. Only an explicit sign colours it.
 */
function deltaTone(delta: string | undefined): string {
  if (!delta) return "text-text-subtle";
  const number = delta.match(/\d[\d,]*(?:\.\d+)?/);
  if (!number || Number.parseFloat(number[0].replace(/,/g, "")) === 0) return "text-text-subtle";
  const sign = delta.match(/^[\s₹$€£]*([+\-−–])/)?.[1];
  if (sign === "+") return "text-success";
  if (sign) return "text-danger";
  return "text-text-subtle";
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  delta,
  href,
  animate = false,
  featured = false,
  fit = false,
}: {
  label: string;
  value: string | number;
  /** The caption: one line naming the baseline or what the number counts. */
  hint?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Signed change with its window, e.g. "+12 this week". */
  delta?: string;
  /** Adds the round arrow link top-right; the whole tile becomes its click target. */
  href?: string;
  /** Tween a numeric `value` from its previous figure (ignored for strings). */
  animate?: boolean;
  /** The filled brand tile (white text, inverted arrow). Use for at most one figure per row. */
  featured?: boolean;
  /** Size the figure to the card (container query) and keep it on one line: for long money figures in narrow cards. */
  fit?: boolean;
}) {
  const valueClass = cn(
    "nums font-semibold leading-none tracking-[-0.03em]",
    fit ? "whitespace-nowrap text-[clamp(1.375rem,13cqi,2.75rem)]" : "text-[2rem] sm:text-[2.5rem] lg:text-[2.75rem]",
    featured ? "text-[color:var(--admin-tile-ink)]" : "text-foreground",
  );
  const deltaClass = featured ? "text-[color:var(--admin-tile-ink)]" : deltaTone(delta);

  return (
    <div
      className={cn(
        "relative min-w-0 rounded-[var(--radius-admin-card)] p-[var(--admin-pad-panel)]",
        featured
          ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]"
          : "border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] shadow-[var(--admin-shadow)]",
        href && "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
      )}
    >
      <div className="flex min-h-9 items-start justify-between gap-3">
        <p
          className={cn(
            "flex items-center gap-2 pt-1.5 text-sm font-medium",
            featured ? "text-[color:var(--admin-tile-ink)]" : "text-text-subtle",
          )}
        >
          {DOT[tone] && !featured ? (
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} />
          ) : null}
          {label}
        </p>
        {href ? <ArrowLinkButton href={href} label={`Open ${label}`} inverted={featured} stretch /> : null}
      </div>
      <div className={cn("mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1", fit && "[container-type:inline-size]")}>
        {animate && typeof value === "number" ? (
          <Count value={value} className={valueClass} />
        ) : (
          <span className={valueClass}>{value}</span>
        )}
        {delta ? <span className={cn("nums text-sm font-semibold", deltaClass)}>{delta}</span> : null}
      </div>
      {hint ? (
        <p className={cn("mt-2 text-sm", featured ? "text-[color:var(--admin-tile-ink)]" : "text-text-subtle")}>{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Responsive summary row. `cols` is the desktop column count. The default
 * is separate tiles 16px apart, as on the intern dashboard. `variant="strip"`
 * is the old joined strip (one border, hairline dividers) for the college
 * console, which keeps its dark shell: the 1px gap over an ink background
 * draws the dividers, so the column counts below keep every row full (an
 * empty cell would show as a grey block).
 *
 * The widest layout waits for `xl`, not `lg`: the sidebar appears at `lg`
 * (1024px) and takes ~248px, so a 4-up grid at exactly 1024 would get ~165px
 * cells and the values wrap.
 */
export function StatGrid({
  cols = 4,
  variant = "tiles",
  layout = "grid",
  label = "Key figures",
  className,
  children,
}: {
  cols?: 3 | 4 | 6;
  variant?: "tiles" | "strip";
  /**
   * `ticker` is one horizontal strip: a single row of cells divided by 1px
   * rules, scrolling sideways on a phone. It ignores `cols` and `variant`.
   */
  layout?: "grid" | "ticker";
  /** Names the ticker strip for assistive tech (it is a focusable scroll region). */
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (layout === "ticker") {
    return (
      <div
        // A scroll area must be reachable by keyboard when its cells are not links.
        tabIndex={0}
        role="region"
        aria-label={label}
        className={cn(
          "flex overflow-x-auto divide-x divide-border border border-border focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          "[&>*]:min-w-40 [&>*]:flex-1 [&>*]:shrink-0 [&>*]:rounded-none [&>*]:border-0 [&>*]:shadow-none",
          className,
        )}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "grid",
        variant === "tiles"
          ? "gap-[var(--admin-gap)]"
          : "gap-px overflow-hidden border border-border bg-border [&>*]:rounded-none [&>*]:border-0 [&>*]:bg-background [&>*]:shadow-none",
        cols === 3 && "grid-cols-1 sm:grid-cols-3",
        cols === 4 && "grid-cols-2 xl:grid-cols-4",
        cols === 6 && "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
        className
      )}
    >
      {children}
    </div>
  );
}
