import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type StatTone = "brand" | "accent" | "info" | "success" | "warning" | "neutral";

/**
 * A figure in a summary strip. Inside `StatGrid` the figures share one
 * bordered strip with hairline dividers (one object, read left to right)
 * rather than a row of separate cards; standalone it is a card. The tone
 * marks a figure that needs someone (warning) with a dot by its label;
 * `icon` is accepted for old callers and not drawn (decorative chips were
 * the loudest thing on 13 screens).
 */
const DOT: Partial<Record<StatTone, string>> = {
  warning: "bg-accent-500",
  accent: "bg-accent-500",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  delta,
  href,
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
}) {
  const body = (
    <>
      <p className="flex items-center gap-2 text-sm font-medium text-ink-600">
        {DOT[tone] ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} /> : null}
        {label}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="nums text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink-900">{value}</span>
        {delta ? <span className="nums text-sm font-semibold text-brand-700">{delta}</span> : null}
      </div>
      {hint ? <p className="mt-1 text-sm text-ink-600">{hint}</p> : null}
    </>
  );

  const className = cn(
    "block min-w-0 rounded-apple-lg border border-ink-200/80 bg-white px-5 py-4 shadow-xs",
    href && "apple-spring hover:bg-ink-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600",
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
 * Responsive summary strip. `cols` is the desktop column count. The cells
 * share one border; the 1px gap over an ink background draws the dividers,
 * so the column counts below keep every row full (an empty cell would show
 * as a grey block).
 *
 * The widest layout waits for `xl`, not `lg`: the sidebar appears at `lg`
 * (1024px) and takes ~248px, so a 4-up grid at exactly 1024 would get ~165px
 * cells and the values wrap.
 */
export function StatGrid({
  cols = 4,
  className,
  children,
}: {
  cols?: 3 | 4 | 6;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-apple-lg border border-ink-200/80 bg-ink-200/70 shadow-xs",
        "[&>*]:rounded-none [&>*]:border-0 [&>*]:shadow-none",
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
