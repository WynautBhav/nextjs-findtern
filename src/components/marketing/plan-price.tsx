import { savingsPercent } from "@/lib/currency";
import { formatMoney, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A price, with the previous price struck through when the admin has set one.
 *
 * Two arrangements. `inline` is for table cells and running text: the old
 * price sits before the new one. `stack` is for the top of a plan card: the
 * old price sits above in small type and the new price carries the weight,
 * so a reader scanning three cards sees three prices, not three badges.
 *
 * A percentage tag appears only for a partial discount. A price struck to
 * zero is the pilot offer, and the card says so in a sentence (PilotNote)
 * rather than with a "Save 100%" sticker.
 */
export function PlanPrice({
  nowMinor,
  wasMinor,
  currency,
  kind = "rate",
  tone = "light",
  layout = "inline",
  className,
  priceClassName,
}: {
  nowMinor: number;
  wasMinor?: number | null;
  currency: "INR" | "USD";
  kind?: "rate" | "money";
  tone?: "light" | "dark";
  layout?: "inline" | "stack";
  className?: string;
  priceClassName?: string;
}) {
  const format = kind === "rate" ? formatRate : formatMoney;
  const save = savingsPercent(nowMinor, wasMinor);
  const struck = save != null && wasMinor ? format(wasMinor, currency) : null;
  const tag = save != null && nowMinor > 0 ? `Save ${save}%` : null;
  const muted = tone === "dark" ? "text-on-dark-subtle" : "text-ink-400";

  if (layout === "stack") {
    return (
      <span className={cn("flex flex-col items-start tabular-nums", className)}>
        {/* Reserve the line even without a strike, so three cards in a row
            keep their prices on one baseline. Stacked cards on a phone have
            no row to align to, so the blank line goes. */}
        <span className={cn("text-sm font-medium leading-5", muted, !struck && "hidden md:block")} aria-hidden={!struck}>
          {struck ? (
            <del className="decoration-[1.5px]">
              <span className="sr-only">Was </span>
              {struck}
            </del>
          ) : (
            " "
          )}
        </span>
        <span className={priceClassName}>{format(nowMinor, currency)}</span>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums", className)}>
      {struck ? (
        <del className={cn("text-sm font-medium decoration-[1.5px]", muted)}>
          <span className="sr-only">Was </span>
          {struck}
        </del>
      ) : null}
      <span className={priceClassName}>{format(nowMinor, currency)}</span>
      {tag ? (
        <span
          className={cn(
            "self-center whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold",
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
 * One sentence under a pilot-priced plan. Plain text in the card's secondary
 * colour: the strikethrough above already shows the discount, so this only
 * has to say why and for how long.
 */
export function PilotNote({
  wasMinor,
  currency,
  tone = "light",
  className,
}: {
  wasMinor: number;
  currency: "INR" | "USD";
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <p className={cn("text-[13px] leading-relaxed", tone === "dark" ? "text-on-dark-subtle" : "text-ink-500", className)}>
      Pilot pricing for the first batch. Back to {formatRate(wasMinor, currency)} once the pilot closes.
    </p>
  );
}
