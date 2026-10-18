"use client";

import { useId, useState } from "react";
import { Calculator, Check } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { useIsIndia } from "@/components/marketing/region-rates";
import { formatMoney, formatNumber, formatRate } from "@/lib/format";
import { WORK_MONTH, monthlyHours } from "@/lib/plan-offer";
import type { CmsPlan } from "@/lib/content/types";
import { cn } from "@/lib/utils";

/**
 * Quick cost calculator.
 *
 * Three inputs an employer actually knows - which band, how many days a week,
 * how many hours a day - and the arithmetic is shown, not just the result.
 * Days per week is 5 or 6 only: nobody is asked whether they want someone
 * seven days a week. Weeks per month is fixed at four, the same assumption
 * the "≈ a month" figures on the plan cards use, so the two never disagree.
 *
 * Prices come from the same plan rows as the cards; the component is given
 * both rate cards and picks by region on the client, like every other price.
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
  const [days, setDays] = useState<(typeof DAYS)[number]>(WORK_MONTH.daysPerWeek);
  const [hours, setHours] = useState<(typeof HOURS)[number]>(WORK_MONTH.hoursPerDay);
  const uid = useId();

  const plan = plans[Math.min(planIdx, plans.length - 1)];
  if (!plan) return null;

  const hoursMonth = monthlyHours(hours, days);
  const monthly = plan.priceHourlyMinor * hoursMonth;
  const firstMonth = monthly + plan.perHireChargeMinor;

  return (
    <div
      className={cn(
        "grid gap-8 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm sm:p-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12",
        className,
      )}
    >
      {/* ── Inputs ─────────────────────────────────────────────── */}
      <div className="space-y-7">
        <Field label="Which plan?" id={`${uid}-plan`}>
          <Segmented
            name={`${uid}-plan`}
            options={plans.map((p, i) => ({ value: String(i), label: p.displayName, hint: formatRate(p.priceHourlyMinor, currency) }))}
            value={String(planIdx)}
            onChange={(v) => setPlanIdx(Number(v))}
          />
        </Field>

        <Field label="Days a week" id={`${uid}-days`}>
          <Segmented
            name={`${uid}-days`}
            options={DAYS.map((d) => ({ value: String(d), label: `${d} days` }))}
            value={String(days)}
            onChange={(v) => setDays(Number(v) as (typeof DAYS)[number])}
          />
        </Field>

        <Field label="Hours a day" id={`${uid}-hours`}>
          <Segmented
            name={`${uid}-hours`}
            options={HOURS.map((h) => ({ value: String(h), label: `${h} hours` }))}
            value={String(hours)}
            onChange={(v) => setHours(Number(v) as (typeof HOURS)[number])}
          />
        </Field>
      </div>

      {/* ── Result ─────────────────────────────────────────────── */}
      <div className="flex flex-col rounded-2xl bg-brand-950 p-6 text-white sm:p-7">
        <p className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.14em] text-accent-300">
          <Calculator className="size-3.5" aria-hidden />
          {plan.displayName} · {formatNumber(hoursMonth)} hours a month
        </p>

        <p className="mt-4 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl" aria-live="polite">
          {formatMoney(monthly, currency, { zeroLabel: formatMoney(0, currency, { zeroLabel: false }) })}{" "}
          <span className="ml-1 whitespace-nowrap text-base font-medium text-on-dark-subtle">a month</span>
        </p>

        <dl className="mt-6 space-y-2.5 border-t border-white/10 pt-5 text-sm">
          <Row label="Hours">
            {hours} h × {days} d × {WORK_MONTH.weeksPerMonth} weeks = {formatNumber(hoursMonth)} h
          </Row>
          <Row label="Hourly rate">
            {formatRate(plan.priceHourlyMinor, currency)}
            {plan.priceHourlyMinor === 0 ? <span className="ml-1.5 text-accent-300">pilot offer</span> : null}
          </Row>
          <Row label="Per-hire fee, once">{formatMoney(plan.perHireChargeMinor, currency)}</Row>
          <Row label="First month" strong>
            {formatMoney(firstMonth, currency, { zeroLabel: false })}
          </Row>
        </dl>

        <ul className="mt-5 space-y-1.5 text-xs text-on-dark-subtle">
          <li className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
            Billed only against the timesheet hours you approve.
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
            {isIndia ? "Prices include GST." : "No hidden fees."}
          </li>
        </ul>

        <div className="flex-1" />
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <ButtonLink href="/employer/signup" variant="accent" size="md" className="sm:flex-1">
            Start hiring
          </ButtonLink>
          <ButtonLink href="/contact" variant="outlineLight" size="md" className="sm:flex-1">
            Talk to us
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend id={id} className="mb-2.5 text-sm font-semibold text-ink-900">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

/**
 * A radio group drawn as a segmented control. Real radios underneath, so
 * arrow keys move between options and the chosen one is in the form state.
 */
function Segmented({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              "flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-xl border px-2 py-2 text-center text-sm font-medium transition-colors",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30",
              checked
                ? "border-primary bg-brand-50 text-primary"
                : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-900",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span>{o.label}</span>
            {o.hint ? <span className="mt-0.5 text-2xs font-normal text-ink-500">{o.hint}</span> : null}
          </label>
        );
      })}
    </div>
  );
}

function Row({ label, strong, children }: { label: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn("shrink-0", strong ? "font-semibold text-white" : "text-on-dark-subtle")}>{label}</dt>
      <dd className={cn("text-right tabular-nums", strong ? "text-lg font-semibold text-accent-300" : "text-ink-100")}>
        {children}
      </dd>
    </div>
  );
}
