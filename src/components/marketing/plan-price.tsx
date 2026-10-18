import { savingsPercent } from "@/lib/currency";
import { formatMoney, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A price with an optional struck-through "was" price and a "Save N%" tag.
 *
 * The was-price comes from `pricing_plans.compare_at_*` (admin-set); when it is
 * null or not above the current price, only the current price renders. The
 * old price is a real <del> so screen readers announce it as removed.
 */
export function PlanPrice({
  nowMinor,
  wasMinor,
  currency,
  kind = "rate",
  tone = "light",
  className,
  priceClassName,
}: {
  nowMinor: number;
  wasMinor?: number | null;
  currency: "INR" | "USD";
  kind?: "rate" | "money";
  tone?: "light" | "dark";
  className?: string;
  priceClassName?: string;
}) {
  const format = kind === "rate" ? formatRate : formatMoney;
  const save = savingsPercent(nowMinor, wasMinor);

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      {save != null && wasMinor ? (
        <del
          className={cn(
            "text-sm font-medium decoration-[1.5px]",
            tone === "dark" ? "text-on-dark-subtle" : "text-ink-400",
          )}
        >
          <span className="sr-only">Was </span>
          {format(wasMinor, currency)}
        </del>
      ) : null}
      <span className={priceClassName}>{format(nowMinor, currency)}</span>
      {save != null ? (
        <span
          className={cn(
            "self-center rounded-full px-2 py-0.5 text-2xs font-semibold tracking-wide",
            tone === "dark" ? "bg-accent/20 text-accent-300" : "bg-accent-100 text-accent-700",
          )}
        >
          Save {save}%
        </span>
      ) : null}
    </span>
  );
}
