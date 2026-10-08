import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type StatTone = "brand" | "accent" | "info" | "success" | "warning" | "neutral";

const TONE_CLASS: Record<
  StatTone,
  { icon: string; topBorder: string; deltaBadge: string }
> = {
  brand: {
    icon: "bg-brand-50 text-brand-700 border-brand-200/60",
    topBorder: "bg-brand-600",
    deltaBadge: "bg-brand-50 text-brand-700 border-brand-200/60",
  },
  accent: {
    icon: "bg-accent-100 text-accent-800 border-accent-200/60",
    topBorder: "bg-accent-500",
    deltaBadge: "bg-accent-50 text-accent-800 border-accent-200/60",
  },
  info: {
    icon: "bg-blue-50 text-blue-700 border-blue-200/60",
    topBorder: "bg-blue-600",
    deltaBadge: "bg-blue-50 text-blue-700 border-blue-200/60",
  },
  success: {
    icon: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
    topBorder: "bg-emerald-600",
    deltaBadge: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
  },
  warning: {
    icon: "bg-amber-50 text-amber-700 border-amber-200/60",
    topBorder: "bg-amber-500",
    deltaBadge: "bg-amber-50 text-amber-800 border-amber-200/60",
  },
  neutral: {
    icon: "bg-sand-100 text-ink-700 border-sand-200",
    topBorder: "bg-sand-400",
    deltaBadge: "bg-sand-100 text-ink-700 border-sand-200",
  },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  delta,
  href,
}: {
  /** Short uppercase micro-label, e.g. "Total interns". */
  label: string;
  value: string | number;
  /** Required context: the denominator or what the number counts. */
  hint?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Signed change vs a comparison period, e.g. "+12%". */
  delta?: string;
  /** Makes the whole tile a link. */
  href?: string;
}) {
  const styles = TONE_CLASS[tone];
  const body = (
    <>
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-1 opacity-90 transition-opacity group-hover:opacity-100",
          styles.topBorder
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xs font-bold uppercase tracking-wider text-text-subtle">
          {label}
        </p>
        {Icon ? (
          <span
            aria-hidden
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl border shadow-2xs transition-colors group-hover:scale-105",
              styles.icon
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-ink-900 tabular-nums">
          {value}
        </span>
        {delta ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-2xs font-bold border tabular-nums",
              styles.deltaBadge
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>

      {hint ? (
        <p className="mt-1 text-xs leading-relaxed text-text-subtle">{hint}</p>
      ) : null}
    </>
  );

  const className = cn(
    "group relative block overflow-hidden rounded-2xl border border-sand-300 bg-white p-5 shadow-2xs transition-all duration-200",
    href && "hover:border-brand-400 hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-2"
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
        cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        cols === 6 && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
        className
      )}
    >
      {children}
    </div>
  );
}
