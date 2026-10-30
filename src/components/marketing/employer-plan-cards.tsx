"use client";

import { Briefcase, Check, Gift, X, Zap } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { TiltCard } from "@/components/motion/tilt-card";
import { useRegionBands } from "@/components/marketing/region-rates";
import { MonthlyRate } from "@/components/marketing/monthly-rate";
import { OfferNote, PlanPrice } from "@/components/marketing/plan-price";
import type { CmsPlan } from "@/lib/content/types";
import { planHasOffer } from "@/lib/plan-offer";
import { cn } from "@/lib/utils";

/**
 * Employer plan cards - the same `pricing_plans` rows as /pricing and the
 * home table, so names (Espresso / Cappuccino / Latte), prices, the
 * strikethrough and the featured plan can never disagree between pages.
 * Band geometry (score range) still comes from lib/score.
 */

const ICONS = [Gift, Zap, Briefcase] as const;

export function EmployerPlanCards({
  plansInr,
  plansUsd,
}: {
  plansInr: CmsPlan[];
  plansUsd: CmsPlan[];
}) {
  const { isIndia, bands, currency } = useRegionBands();
  const plans = isIndia ? plansInr : plansUsd;

  return (
    <div className="mt-14 grid gap-5 md:grid-cols-3">
      {bands.map((b, i) => {
        const plan = plans[i];
        const Icon = ICONS[i] ?? Gift;
        const featured = Boolean(plan?.isFeatured);
        return (
          <TiltCard key={b.id} max={5} className="rounded-2xl">
            <article
              className={cn(
                "relative flex h-full flex-col rounded-2xl border bg-white p-6 sm:p-7",
                featured ? "border-2 border-primary shadow-lg lg:-my-3 lg:py-9" : "border-ink-200",
              )}
            >
              {featured ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-2xs font-semibold uppercase tracking-[0.1em] text-white">
                  Most popular
                </span>
              ) : null}
              <span className="inline-flex size-10 items-center justify-center rounded-lg bg-brand-50 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink-900">
                {plan?.displayName ?? b.name}
              </h3>
              <PlanPrice
                layout="stack"
                className="mt-4"
                priceClassName="text-[2rem] font-semibold leading-none tracking-[-0.025em] text-ink-900"
                nowMinor={plan?.priceHourlyMinor ?? b.rateMinor}
                wasMinor={plan?.compareAtHourlyMinor}
                currency={currency}
              />
              {plan && planHasOffer(plan) && plan.compareAtHourlyMinor ? (
                <OfferNote wasMinor={plan.compareAtHourlyMinor} currency={currency} className="mt-2" />
              ) : (
                <MonthlyRate hourlyMinor={plan?.priceHourlyMinor ?? b.rateMinor} currency={currency} className="mt-2" />
              )}
              <p className="mt-4 text-sm text-ink-600">{plan?.features[0] ?? b.blurb}</p>
              <p className="mt-4 text-sm font-medium text-primary">
                Score {b.min}–{b.max}/10
              </p>
              <p className="mt-2 flex flex-wrap items-baseline gap-1.5 text-sm text-ink-600">
                <PlanPrice
                  nowMinor={plan?.perHireChargeMinor ?? b.perHireMinor}
                  wasMinor={plan?.compareAtPerHireMinor}
                  currency={currency}
                  kind="money"
                />
                per hire
              </p>
              {plan?.featureList.length ? (
                <ul className="mt-5 space-y-2 border-t border-ink-100 pt-5" aria-label={`${plan.displayName} includes`}>
                  {plan.featureList.map((f) => (
                    <li
                      key={f.label}
                      className={cn("flex gap-2.5 text-sm", f.included ? "text-ink-700" : "text-ink-600")}
                    >
                      {f.included ? (
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      ) : (
                        <X className="mt-0.5 size-4 shrink-0 text-ink-300" aria-hidden />
                      )}
                      <span>
                        <span className="sr-only">{f.included ? "Included: " : "Not included: "}</span>
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex-1" />
              <ButtonLink
                href="/signup?as=employer"
                variant={featured ? "primary" : "outline"}
                block
                className="mt-6"
              >
                Start hiring
              </ButtonLink>
            </article>
          </TiltCard>
        );
      })}
    </div>
  );
}
