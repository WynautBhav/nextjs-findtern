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
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] leading-5 text-text-subtle">
          {label}
        </p>
        {Icon ? (
          <span
            aria-hidden
            className={cn(
              "apple-spring grid size-8 shrink-0 place-items-center rounded-[10px] border text-ink-400 group-hover:text-brand-700",
              styles.icon
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[28px] font-bold leading-[34px] tracking-[-0.02em] text-ink-900 tabular-nums">
          {value}
        </span>
        {delta ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[12px] font-semibold border tabular-nums",
              styles.deltaBadge
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>

      {hint ? (
        <p className="mt-1 text-[13px] leading-relaxed text-text-subtle">{hint}</p>
      ) : null}
    </>
  );

  const className = cn(
    "apple-panel apple-spring group relative block overflow-hidden bg-white p-5",
    href && "apple-pressable hover:border-brand-300 focus-visible:outline-2"
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
