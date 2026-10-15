"use client";

import { Briefcase, Gift, Zap } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { TiltCard } from "@/components/motion/tilt-card";
import { useRegionBands } from "@/components/marketing/region-rates";
import { formatMoney, formatRate } from "@/lib/format";
import type { BandId } from "@/lib/score";
import { cn } from "@/lib/utils";

/**
 * Employer plan cards - the same published bands as /pricing, in the
 * visitor's currency. Amounts were once hardcoded here in INR (with a stale
 * "placeholder amounts" footnote disowning them); they now follow the
 * region bands, so this section can never disagree with the rate card.
 */

const META: Record<BandId, { name: string; Icon: typeof Gift; blurb: string; band: string; cta: string; featured?: boolean }> = {
  standard: {
    name: "Free",
    Icon: Gift,
    blurb: "Budget-friendly hiring",
    band: "Under 6/10",
    cta: "Start hiring",
  },
  skilled: {
    name: "Skilled",
    Icon: Zap,
    blurb: "Skilled interns",
    band: "6–8/10",
    cta: "Start hiring",
    featured: true,
  },
  assured: {
    name: "Top-rated",
    Icon: Briefcase,
    blurb: "Top-rated talent",
    band: "8+/10",
    cta: "Start hiring",
  },
};

export function EmployerPlanCards() {
  const { bands, currency } = useRegionBands();

  return (
    <div className="mt-14 grid gap-5 md:grid-cols-3">
      {bands.map((b) => {
        const meta = META[b.id];
        return (
          <TiltCard key={b.id} max={5} className="rounded-2xl">
            <article
              className={cn(
                "relative flex h-full flex-col rounded-2xl border bg-white p-6 sm:p-7",
                meta.featured ? "border-2 border-primary shadow-lg lg:-my-3 lg:py-9" : "border-ink-200",
              )}
            >
              {meta.featured ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-2xs font-semibold uppercase tracking-[0.1em] text-white">
                  Most popular
                </span>
              ) : null}
              <span className="inline-flex size-10 items-center justify-center rounded-lg bg-brand-50 text-primary">
                <meta.Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink-900">
                {meta.name}
              </h3>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-ink-900">
                {formatRate(b.rateMinor, currency)}
              </p>
              <p className="mt-1.5 text-sm text-ink-500">{meta.blurb}</p>
              <p className="mt-4 text-sm font-medium text-primary">Score {meta.band}</p>
              <p className="mt-2 text-sm text-ink-500">
                {b.perHireMinor > 0
                  ? `${formatMoney(b.perHireMinor, currency)} per hire`
                  : "No per-hire charge"}
              </p>
              <div className="flex-1" />
              <ButtonLink
                href="/employer/signup"
                variant={meta.featured ? "primary" : "outline"}
                block
                className="mt-6"
              >
                {meta.cta}
              </ButtonLink>
            </article>
          </TiltCard>
        );
      })}
    </div>
  );
}
