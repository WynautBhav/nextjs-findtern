"use client";

import { ArrowRight, Check, Coffee, X } from "lucide-react";

import { PageSection } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { TiltCard } from "@/components/motion/tilt-card";
import { CountUp } from "@/components/motion/count-up";
import { FaqExplorer } from "@/components/marketing/faq-explorer";
import { formatMoney, formatRate } from "@/lib/format";
import { useRegionBands } from "@/components/marketing/region-rates";
import { MonthlyRate } from "@/components/marketing/monthly-rate";
import { PilotNote, PlanPrice } from "@/components/marketing/plan-price";
import { PricingCalculator } from "@/components/marketing/pricing-calculator";
import { inrToUsd } from "@/lib/currency";
import { pricingFaq } from "@/lib/content/pricing-faq";
import type { CmsPlan } from "@/lib/content/types";
import { planHasOffer } from "@/lib/plan-offer";
import { cn } from "@/lib/utils";

/* Region-dependent body of /pricing. Amounts come from the `pricing_plans`
 * table (admin-editable); the band geometry comes from lib/score. Exactly
 * three plans per region - the table holds both rate cards, and returning
 * both is what once rendered every plan twice. */

type AltCard = {
  label: string;
  price: string;
  example: string;
  note: string;
};

/** Hours in the worked example: the 160-hour minimum on paid bands. */
const EXAMPLE_HOURS = 160;

/* Authored in rupees; USD derives at ₹100 = $1 like every other price. The
 * Findtern card is computed from the live plan rows, so it moves when an
 * admin edits a price. */
function alternatives(isIndia: boolean, plans: CmsPlan[]): AltCard[] {
  const money = (rupees: number) =>
    formatMoney((isIndia ? rupees : inrToUsd(rupees)) * 100, isIndia ? "INR" : "USD");
  const currency = isIndia ? "INR" : "USD";
  const mid = plans.find((p) => p.isFeatured) ?? plans[1] ?? plans[0];
  const hourly = plans.map((p) => p.priceHourlyMinor);
  const findternTotal = mid ? mid.priceHourlyMinor * EXAMPLE_HOURS + mid.perHireChargeMinor : 0;

  return [
    {
      label: "Agency or job board",
      price: "8.33% of CTC",
      example: money(50000),
      note: `On a ${money(600000)} CTC hire, at an assisted-hire rate.`,
    },
    {
      label: "Hiring in-house",
      price: `${money(18000)} – ${money(40000)}`,
      example: money(29000),
      note: "Recruiter time and three screening rounds, with no comparable signal.",
    },
    {
      label: "Findtern",
      price: `${formatRate(Math.min(...hourly), currency)} – ${formatRate(Math.max(...hourly), currency)}`,
      example: formatMoney(findternTotal, currency),
      note: mid
        ? `${EXAMPLE_HOURS} hours on ${mid.displayName} at ${formatRate(mid.priceHourlyMinor, currency)}, plus the ${formatMoney(mid.perHireChargeMinor, currency)} per-hire fee.`
        : "",
    },
  ];
}

export function PricingContent({
  plansInr,
  plansUsd,
}: {
  plansInr: CmsPlan[];
  plansUsd: CmsPlan[];
}) {
  const { isIndia, currency, bands } = useRegionBands();
  const plans = isIndia ? plansInr : plansUsd;
  const featuredIdx = Math.max(
    0,
    plans.findIndex((p) => p.isFeatured),
  );
  const altCards = alternatives(isIndia, plans);
  const perHireMinor = plans[0]?.perHireChargeMinor ?? bands[0]?.perHireMinor ?? 0;

  const MATRIX = [
    { label: "Who is it for", get: (p: CmsPlan) => p.features[0] ?? "-" },
    { label: "Findtern Score", get: (p: CmsPlan) => p.features[1] ?? "-" },
    {
      label: "Per hiring charge",
      get: (p: CmsPlan) => (
        <PlanPrice
          nowMinor={p.perHireChargeMinor}
          wasMinor={p.compareAtPerHireMinor}
          currency={currency}
          kind="money"
        />
      ),
    },
    {
      label: "Price",
      get: (p: CmsPlan) => (
        <PlanPrice nowMinor={p.priceHourlyMinor} wasMinor={p.compareAtHourlyMinor} currency={currency} />
      ),
    },
    { label: "Duration", get: (p: CmsPlan) => p.internshipDuration },
    { label: "What you get", get: (p: CmsPlan) => p.features[2] ?? "-" },
  ];

  return (
    <>
      {/* ── How the bands map to coffee ─────────────────────────────── */}
      <PageSection tone="muted">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-4xl">
            Score band <span className="whitespace-nowrap text-primary">&rarr;</span>{" "}
            plan name
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Three plans, three score bands. A low score is not a rejection - it
            is a lower price.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {bands.map((band, i) => {
            const plan = plans[i];
            const featured = i === featuredIdx;
            return (
              <TiltCard key={band.id} max={5} className="rounded-2xl">
                <article
                  className={cn(
                    "relative flex h-full flex-col rounded-2xl border bg-white p-6 sm:p-7",
                    featured ? "border-2 border-primary shadow-lg" : "border-ink-200",
                  )}
                >
                  {featured ? (
                    <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-2xs font-semibold uppercase tracking-[0.12em] text-white">
                      Most popular
                    </span>
                  ) : null}
                  <span className="inline-flex size-10 items-center justify-center rounded-lg bg-brand-50 text-primary">
                    <Coffee className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink-900">
                    {plan?.displayName ?? band.name}
                  </h3>
                  <p className="mt-1 text-sm text-ink-500">
                    {band.min}–{band.max}/10
                  </p>
                  <PlanPrice
                    layout="stack"
                    className="mt-4"
                    priceClassName="text-[2rem] font-semibold leading-none tracking-[-0.025em] text-ink-900"
                    nowMinor={plan?.priceHourlyMinor ?? band.rateMinor}
                    wasMinor={plan?.compareAtHourlyMinor}
                    currency={currency}
                  />
                  {plan && planHasOffer(plan) && plan.compareAtHourlyMinor ? (
                    <PilotNote wasMinor={plan.compareAtHourlyMinor} currency={currency} className="mt-2" />
                  ) : (
                    <MonthlyRate hourlyMinor={plan?.priceHourlyMinor ?? band.rateMinor} currency={currency} className="mt-2" />
                  )}
                  <p className="mt-4 text-sm text-ink-500">{band.blurb}</p>
                  <p className="mt-5 flex items-center gap-2 border-t pt-4 text-sm text-ink-700">
                    <Check className="size-4 shrink-0 text-primary" aria-hidden />
                    <PlanPrice
                      nowMinor={plan?.perHireChargeMinor ?? band.perHireMinor}
                      wasMinor={plan?.compareAtPerHireMinor}
                      currency={currency}
                      kind="money"
                    />
                    <span>per hire</span>
                  </p>
                  {plan?.featureList.length ? (
                    <ul className="mt-4 space-y-2.5" aria-label={`${plan.displayName} includes`}>
                      {plan.featureList.map((f) => (
                        <li
                          key={f.label}
                          className={cn(
                            "flex gap-2.5 text-sm",
                            f.included ? "text-ink-700" : "text-ink-400",
                          )}
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
                </article>
              </TiltCard>
            );
          })}
        </div>
      </PageSection>

      {/* ── Quick calculator ────────────────────────────────────────── */}
      <PageSection id="calculator">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-4xl">
            What an intern costs a month
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Change the three words that matter. The arithmetic sits beside the answer.
          </p>
        </div>
        <PricingCalculator plansInr={plansInr} plansUsd={plansUsd} className="mt-12" />
      </PageSection>

      {/* ── The comparison matrix ───────────────────────────────────── */}
      <PageSection tone="muted">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-4xl">
            Compare every attribute
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            This is the whole table. There is no fourth column.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
          {/* min-w-0 on the scroller: without it the 42rem table widened the
              section itself on a 390px phone instead of scrolling inside. */}
          <div className="min-w-0 overflow-x-auto [scrollbar-width:thin]">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <caption className="sr-only">
                Findtern hiring plans compared across six attributes. Every plan carries
                a fixed per-hiring charge to cover verified screening and talent matching.
              </caption>
              <thead>
                <tr className="border-b border-ink-200">
                  <th
                    scope="col"
                    className="w-1/3 bg-ink-50 px-6 py-5 text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500"
                  >
                    Plan
                  </th>
                  {plans.map((p, i) => (
                    <th
                      key={p.id}
                      scope="col"
                      className={cn(
                        "relative px-6 py-5 align-top",
                        i === featuredIdx && "bg-brand-50",
                      )}
                    >
                      {i === featuredIdx ? (
                        <span
                          aria-hidden
                          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-accent"
                        />
                      ) : null}
                      <span
                        className={cn(
                          "block text-lg font-semibold tracking-tight",
                          i === featuredIdx ? "text-primary" : "text-ink-900",
                        )}
                      >
                        {p.displayName}
                      </span>
                      <PlanPrice
                        className="mt-1 text-sm font-medium text-ink-500"
                        nowMinor={p.priceHourlyMinor}
                        wasMinor={p.compareAtHourlyMinor}
                        currency={currency}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row, rowIndex) => (
                  <tr
                    key={row.label}
                    className={cn(
                      "group transition-colors duration-200 hover:bg-ink-50/80",
                      rowIndex % 2 === 1 && "bg-ink-50/40",
                    )}
                  >
                    <th
                      scope="row"
                      className="px-6 py-4 text-sm font-medium text-ink-500"
                    >
                      {row.label}
                    </th>
                    {plans.map((p, i) => (
                      <td
                        key={p.id}
                        className={cn(
                          "border-l border-ink-100 px-6 py-4 text-base",
                          i === featuredIdx && "bg-brand-50",
                          row.label === "Price" || row.label === "Per hiring charge"
                            ? "font-semibold text-ink-900"
                            : "text-ink-600",
                        )}
                      >
                        {row.get(p)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-ink-200">
                  <th scope="row" className="px-6 py-5">
                    <span className="sr-only">Next step</span>
                  </th>
                  {plans.map((p, i) => (
                    <td key={p.id} className={cn("px-6 py-5", i === featuredIdx && "bg-brand-50")}>
                      <ButtonLink
                        href="/employers"
                        variant={i === featuredIdx ? "primary" : "outline"}
                        size="sm"
                        block
                      >
                        Choose {p.displayName}
                      </ButtonLink>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-ink-500">
          {isIndia ? "Prices include GST." : "No hidden fees."}
        </p>
      </PageSection>

      {/* ── Employer cost comparison ────────────────────────────────── */}
      <PageSection tone="brand">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl">
            Against the alternatives
          </h2>
          <p className="mt-4 text-lg text-on-dark-subtle">
            {isIndia
              ? "Two other ways to hire an intern in India, priced the way they are usually quoted."
              : "Two other ways to hire an intern in the US, priced the way they are usually quoted."}
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {altCards.map((card) => (
            <CostCard
              key={card.label}
              label={card.label}
              price={card.price}
              example={card.example}
              note={card.note}
              featured={card.label === "Findtern"}
              points={
                card.label === "Findtern"
                  ? [
                      "Stipend routed through Findtern",
                      "Score-based rate, no negotiation",
                      "One flat per-hire fee on every plan",
                      "8.33% of CTC only on full-time conversion",
                    ]
                  : undefined
              }
            />
          ))}
        </div>
      </PageSection>

      {/* ── FAQ ────────────────────────────────────────────────────── */}
      <PageSection>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-4xl">
              Pricing questions
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              The short answers. The full set lives on the FAQ page.
            </p>
            <div className="mt-8 flex items-baseline gap-3">
              <p className="text-5xl font-bold tracking-tight text-primary">
                {/* Keyed by currency: the tween writes to the DOM directly, so
                    a prefix change must remount rather than update in place. */}
                <CountUp
                  key={currency}
                  value={perHireMinor / 100}
                  prefix={currency === "INR" ? "₹" : "$"}
                />
              </p>
              <p className="text-sm text-ink-500">
                fixed per-hire fee
                <br />
                on every plan
              </p>
            </div>
          </div>
          <FaqExplorer
            showSearch={false}
            showChips={false}
            items={pricingFaq(formatMoney(perHireMinor, currency))}
          />
        </div>
      </PageSection>
    </>
  );
}

function CostCard({
  label,
  price,
  example,
  note,
  featured,
  points,
}: {
  label: string;
  price: string;
  example: string;
  note: string;
  featured?: boolean;
  points?: string[];
}) {
  return (
    <TiltCard max={4} className="rounded-2xl">
      <article
        className={cn(
          "flex h-full flex-col rounded-2xl border p-6 sm:p-7",
          featured
            ? "border-2 border-accent bg-white/10 backdrop-blur-sm"
            : "border-white/12 bg-white/[0.04]",
        )}
      >
        <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-accent-300">
          {label}
        </p>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{price}</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-white">{example}</p>
        <p className="mt-3 text-sm leading-relaxed text-on-dark-subtle">{note}</p>
        {points ? (
          <ul className="mt-5 space-y-2 border-t border-white/10 pt-5">
            {points.map((p) => (
              <li key={p} className="flex gap-2.5 text-sm text-ink-200">
                <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        ) : null}
      </article>
    </TiltCard>
  );
}

export function PricingCta() {
  return (
    <ButtonLink href="/employers" variant="primary" size="lg">
      Start hiring
      <ArrowRight className="size-4" aria-hidden />
    </ButtonLink>
  );
}
