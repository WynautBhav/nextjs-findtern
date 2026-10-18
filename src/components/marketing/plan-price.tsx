import { Sparkles } from "lucide-react";

import { savingsPercent } from "@/lib/currency";
import { formatMoney, formatRate } from "@/lib/format";
import { PLAN_OFFER } from "@/lib/plan-offer";
import { cn } from "@/lib/utils";

/**
 * A price with an optional struck-through "was" price and a small tag.
 *
 * The was-price comes from `pricing_plans.compare_at_*` (admin-set); when it is
 * null or not above the current price, only the current price renders. The
 * old price is a real <del> so screen readers announce it as removed.
 *
 * A price struck through to zero is the pilot offer rather than a "Save 100%"
 * discount, so the tag says so instead of printing a percentage.
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
  const tag = save == null ? null : nowMinor === 0 ? PLAN_OFFER.freeTag : `Save ${save}%`;

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
      {tag ? (
        <span
          className={cn(
            "self-center whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold tracking-wide",
            tone === "dark" ? "bg-accent/20 text-accent-300" : "bg-accent-100 text-accent-700",
          )}
        >
          {tag}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The framed "discounted price" note on a plan that carries an offer. One
 * component so the home table, pricing page and employer cards print the same
 * words. `tone="dark"` is for cards sitting on the brand wash.
 */
export function OfferFrame({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-xl border border-dashed px-3 py-2.5 text-xs leading-relaxed",
        tone === "dark"
          ? "border-accent-300/50 bg-accent/10 text-accent-200"
          : "border-accent-400/70 bg-accent-100 text-accent-700",
        className,
      )}
    >
      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent-500" aria-hidden />
      <span>
        <strong className="font-semibold">{PLAN_OFFER.badge}.</strong> {PLAN_OFFER.note}
      </span>
    </p>
  );
}
