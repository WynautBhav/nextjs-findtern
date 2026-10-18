"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { useIsIndia } from "@/components/marketing/region-rates";
import { formatMoney, formatNumber, formatRate } from "@/lib/format";
import { WORK_MONTH, monthlyHours } from "@/lib/plan-offer";
import type { CmsPlan } from "@/lib/content/types";
import { cn } from "@/lib/utils";

/**
 * The cost calculator, written as a sentence.
 *
 * "A Cappuccino intern working 8 hours a day, 5 days a week costs ₹16,000 a
 * month." The three variables are the only words an employer has to change,
 * so they are the only controls: inline selects set in the brand colour,
 * native so a phone opens its own picker. The ledger beside the sentence
 * shows the multiplication line by line, with the one-time per-hire charge
 * kept separate from the recurring figure so neither is mistaken for the
 * other.
 *
 * Days a week is 5 or 6 - nobody is asked whether they want someone seven
 * days a week. Weeks a month is fixed at four, the same assumption the plan
 * cards use, so the two never disagree.
 */
const DAYS = [5, 6] as const;
const HOURS = [4, 6, 8] as const;

export function PricingCalculator({
  plansInr,
  plansUsd,
  className,
}: {
  plansInr: CmsPlan[];
  plansUsd: CmsPlan[];
  className?: string;
}) {
  const isIndia = useIsIndia();
  const plans = isIndia ? plansInr : plansUsd;
  const currency = plans[0]?.currency ?? (isIndia ? "INR" : "USD");
  const featuredIdx = Math.max(0, plans.findIndex((p) => p.isFeatured));

  const [planIdx, setPlanIdx] = useState(featuredIdx);
  const [hours, setHours] = useState<number>(WORK_MONTH.hoursPerDay);
  const [days, setDays] = useState<number>(WORK_MONTH.daysPerWeek);
  const uid = useId();

  const plan = plans[Math.min(planIdx, plans.length - 1)];
  if (!plan) return null;

  const hoursMonth = monthlyHours(hours, days);
  const monthly = plan.priceHourlyMinor * hoursMonth;
  const money = (minor: number) => formatMoney(minor, currency, { zeroLabel: false });

  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-2xl border border-ink-200 bg-white lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]",
        className,
      )}
    >
      {/* ── The sentence ─────────────────────────────────────────── */}
      <div className="p-6 sm:p-8 lg:p-10">
        <p className="max-w-[26ch] text-balance text-[clamp(1.375rem,2.6vw,1.875rem)] font-medium leading-[1.45] tracking-[-0.015em] text-ink-900">
          A{" "}
          <InlineSelect
            id={`${uid}-plan`}
            label="Plan"
            value={String(planIdx)}
            onChange={(v) => setPlanIdx(Number(v))}
            options={plans.map((p, i) => ({ value: String(i), label: p.displayName }))}
          />{" "}
          intern working{" "}
          <InlineSelect
            id={`${uid}-hours`}
            label="Hours a day"
            value={String(hours)}
            onChange={(v) => setHours(Number(v))}
            options={HOURS.map((h) => ({ value: String(h), label: `${h} hours` }))}
          />{" "}
          a day,{" "}
          <InlineSelect
            id={`${uid}-days`}
            label="Days a week"
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={DAYS.map((d) => ({ value: String(d), label: `${d} days` }))}
          />{" "}
          a week, costs
        </p>

        <p className="mt-7 flex flex-wrap items-baseline gap-x-2 tabular-nums" aria-live="polite">
          <span className="text-[clamp(2.5rem,5vw,3.5rem)] font-semibold leading-none tracking-[-0.035em] text-ink-900">
            {money(monthly)}
          </span>
          <span className="text-lg font-medium text-ink-500">a month</span>
        </p>

        <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-500">
          Billed against the timesheet hours you approve.{" "}
          {isIndia ? "Prices include GST." : "No hidden fees."}
        </p>
      </div>

      {/* ── The ledger ───────────────────────────────────────────── */}
      <div className="flex flex-col border-t border-ink-200 bg-ink-50/60 p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
        <dl className="text-sm tabular-nums">
          <Row
            label={
              <>
                {formatNumber(hoursMonth)} hours × {plan.priceHourlyMinor > 0 ? formatRate(plan.priceHourlyMinor, currency) : "free"}
              </>
            }
          >
            {money(monthly)}
          </Row>
          <Row label="Per-hire charge, once">{money(plan.perHireChargeMinor)}</Row>
          <Row label="First month" strong>
            {money(monthly + plan.perHireChargeMinor)}
          </Row>
          <Row label="Each month after" last>
            {money(monthly)}
          </Row>
        </dl>

        <p className="mt-4 text-xs leading-relaxed text-ink-500">
          {formatNumber(hours)} h × {days} d × {WORK_MONTH.weeksPerMonth} weeks = {formatNumber(hoursMonth)} hours.
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-8">
          <ButtonLink href="/employer/signup" variant="primary" size="md">
            Start hiring
          </ButtonLink>
          <ButtonLink href="/contact" variant="link" size="md" className="px-0">
            Talk to us first
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

/**
 * A native select drawn as a word in the sentence. It keeps the sentence's
 * size and line-height, sits on the brand colour with an underline that
 * reads as "changeable", and opens the platform picker on touch.
 */
function InlineSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <span className="relative inline-flex items-baseline whitespace-nowrap align-baseline">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "peer cursor-pointer appearance-none rounded-sm border-0 bg-transparent p-0 pr-5 text-[length:inherit] font-semibold leading-[inherit] tracking-[inherit] text-primary",
          "underline decoration-brand-300 decoration-2 underline-offset-[6px] transition-colors duration-150 hover:decoration-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-0 top-1/2 size-[0.6em] -translate-y-1/2 text-primary transition-transform duration-150 peer-focus-visible:rotate-180"
      />
    </span>
  );
}

function Row({
  label,
  strong,
  last,
  children,
}: {
  label: React.ReactNode;
  strong?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-6 py-3",
        !last && "border-b border-ink-200/80",
        strong && "border-b-0 pt-4",
      )}
    >
      <dt className={cn(strong ? "text-base font-semibold text-ink-900" : "text-ink-600")}>{label}</dt>
      <dd className={cn("shrink-0 text-right", strong ? "text-xl font-semibold text-ink-900" : "font-medium text-ink-800")}>
        {children}
      </dd>
    </div>
  );
}
