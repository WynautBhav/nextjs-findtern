import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Count } from "@/components/admin/motion";
import { cn } from "@/lib/utils";

export type StatTone = "brand" | "accent" | "info" | "success" | "warning" | "neutral";

/**
 * A figure in a summary row: a flat tile with a 1px rule (no shadow, no
 * ground of its own), alone or inside `StatGrid`. The tone
 * marks a figure that needs someone (warning) with a dot by its label;
 * `icon` is accepted for old callers and not drawn (decorative chips were
 * the loudest thing on 13 screens).
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
}: {
  label: string;
  value: string | number;
  /** Required context: the denominator or what the number counts. */
  hint?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Signed change with its window, e.g. "+12 this week". */
  delta?: string;
  /** Makes the whole tile a link. */
  href?: string;
  /** Tween a numeric `value` from its previous figure (ignored for strings). */
  animate?: boolean;
}) {
  const valueClass = "nums text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground";
  const body = (
    <>
      <p className="flex items-center gap-2 text-sm font-medium text-text-subtle">
        {DOT[tone] ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} /> : null}
        {label}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {animate && typeof value === "number" ? (
          <Count value={value} className={valueClass} />
        ) : (
          <span className={valueClass}>{value}</span>
        )}
        {delta ? <span className={cn("nums text-sm font-semibold", deltaTone(delta))}>{delta}</span> : null}
      </div>
      {hint ? <p className="mt-1 text-sm text-text-subtle">{hint}</p> : null}
    </>
  );

  const className = cn(
    "block min-w-0 border border-border px-5 py-4",
    href && "apple-spring hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
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
          ? "gap-4"
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
