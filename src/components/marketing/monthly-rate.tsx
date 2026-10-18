"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";

import { formatMoney, formatNumber } from "@/lib/format";
import { HOURS_PER_MONTH, WORK_MONTH } from "@/lib/plan-offer";
import { cn } from "@/lib/utils";

/**
 * "≈ ₹16,000 a month" beside an hourly rate, with the working one tap away.
 *
 * The hourly figure is the published price; the monthly one is arithmetic on
 * a stated assumption (8 h × 5 d × 4 w = 160 h). The assumption is shown in a
 * tooltip rather than hidden, because an employer who works six days a week
 * needs to know what to multiply. Hover and keyboard focus open it, and a tap
 * toggles it so it works on a phone, where there is no hover.
 */
export function MonthlyRate({
  hourlyMinor,
  currency,
  tone = "light",
  className,
}: {
  hourlyMinor: number;
  currency: "INR" | "USD";
  tone?: "light" | "dark";
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (hourlyMinor <= 0) return null;

  const monthly = hourlyMinor * HOURS_PER_MONTH;
  const muted = tone === "dark" ? "text-on-dark-subtle" : "text-ink-500";

  return (
    <span className={cn("group relative inline-flex items-center gap-1.5 text-sm", muted, className)}>
      <span>
        ≈ <span className={cn("font-semibold", tone === "dark" ? "text-white" : "text-ink-800")}>{formatMoney(monthly, currency)}</span> a month
      </span>
      <button
        type="button"
        aria-label="How the monthly figure is calculated"
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className={cn(
          "grid size-6 place-items-center rounded-full transition-colors",
          tone === "dark" ? "text-on-dark-subtle hover:text-white" : "text-ink-400 hover:text-ink-800",
        )}
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-0 top-full z-20 mt-2 w-60 rounded-xl border p-3 text-left text-xs leading-relaxed shadow-lg transition-opacity duration-150",
          "border-ink-200 bg-white text-ink-700",
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        <strong className="font-semibold text-ink-900">
          {formatNumber(HOURS_PER_MONTH)} hours a month
        </strong>
        <br />
        {WORK_MONTH.hoursPerDay} hours a day × {WORK_MONTH.daysPerWeek} days a week ={" "}
        {WORK_MONTH.hoursPerDay * WORK_MONTH.daysPerWeek} hours a week, over {WORK_MONTH.weeksPerMonth} weeks.
        <br />
        {formatMoney(hourlyMinor, currency)} × {HOURS_PER_MONTH} = {formatMoney(monthly, currency)}.
      </span>
    </span>
  );
}
