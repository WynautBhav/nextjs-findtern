import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type StatTone = "brand" | "accent" | "info" | "success" | "warning" | "neutral";

/**
 * A KPI tile. Admin tiles are monochrome with one accent (DESIGN.md, 8 Oct):
 * the tone only tints the small icon chip, so six tiles on one screen never
 * compete with the figure. Same type ramp as the shared `StatTile`.
 */
const ICON_TONE: Record<StatTone, string> = {
  brand: "bg-brand-50 text-brand-700",
  accent: "bg-accent-100 text-accent-700",
  info: "bg-brand-50 text-brand-700",
  success: "bg-brand-50 text-brand-700",
  warning: "bg-accent-100 text-accent-700",
  neutral: "bg-ink-100 text-ink-600",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
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
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-600">{label}</p>
        {Icon ? (
          <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-apple-sm", ICON_TONE[tone])}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="nums text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink-900">{value}</span>
        {delta ? <span className="nums text-sm font-semibold text-brand-700">{delta}</span> : null}
      </div>
      {hint ? <p className="mt-1.5 text-sm text-ink-600">{hint}</p> : null}
    </>
  );

  const className = cn(
    "block min-w-0 rounded-apple-lg border border-ink-200/80 bg-white p-5 shadow-xs",
    href && "apple-spring hover:border-brand-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-brand-600",
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
 * Responsive KPI grid. `cols` is the desktop column count; the grid collapses
 * to 1 column on phones and 2 on tablets.
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
        "grid gap-4",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
        cols === 4 && "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
        cols === 6 && "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
        className
      )}
    >
      {children}
    </div>
  );
}
