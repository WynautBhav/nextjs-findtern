"use client";

import type { PriceCurrency } from "@/lib/currency";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney, formatNumber } from "@/lib/format";
import { HOURS_PER_MONTH, WORK_MONTH } from "@/lib/plan-offer";
import { cn } from "@/lib/utils";

/**
 * "₹16,000 a month at 160 hours" under an hourly rate.
 *
 * The monthly figure is derived, so the assumption behind it is part of the
 * sentence rather than hidden behind an icon: the hour count is the control,
 * and the tooltip shows the multiplication. Employers who work six days a
 * week can see what to change.
 */
export function MonthlyRate({
  hourlyMinor,
  currency,
  tone = "light",
  className,
}: {
  hourlyMinor: number;
  currency: PriceCurrency;
  tone?: "light" | "dark";
  className?: string;
}) {
  if (hourlyMinor <= 0) return null;
  const monthly = hourlyMinor * HOURS_PER_MONTH;
  const dark = tone === "dark";

  return (
    <p className={cn("text-sm leading-5 tabular-nums", dark ? "text-on-dark-subtle" : "text-ink-500", className)}>
      <span className={cn("font-medium", dark ? "text-white" : "text-ink-700")}>{formatMoney(monthly, currency)}</span> a month at{" "}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "cursor-help rounded-sm underline decoration-dotted decoration-[1.5px] underline-offset-[3px] transition-colors duration-150",
              dark
                ? "decoration-on-dark-subtle/70 hover:text-white"
                : "decoration-ink-400 hover:text-ink-800",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            {formatNumber(HOURS_PER_MONTH)} hours
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {WORK_MONTH.hoursPerDay} hours a day × {WORK_MONTH.daysPerWeek} days a week × {WORK_MONTH.weeksPerMonth} weeks ={" "}
          {HOURS_PER_MONTH} hours.
          <br />
          {formatMoney(hourlyMinor, currency)} × {HOURS_PER_MONTH} = {formatMoney(monthly, currency)}.
        </TooltipContent>
      </Tooltip>
    </p>
  );
}
