"use client";

import { ArrowRight, Check, Coffee, Minus } from "lucide-react";

import { PageSection } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { TiltCard } from "@/components/motion/tilt-card";
import { CountUp } from "@/components/motion/count-up";
import { FaqExplorer } from "@/components/marketing/faq-explorer";
import { formatMoney, formatRate } from "@/lib/format";
import { useRegionBands } from "@/components/marketing/region-rates";
import { PER_HIRE_CUTOFF } from "@/lib/score";
import type { CmsPlan } from "@/lib/content/types";
import { cn } from "@/lib/utils";

/* Region-dependent body of /pricing. Amounts come from the `pricing_plans`
 * table (admin-editable); the band geometry comes from lib/score. Exactly
 * three plans per region - the table holds both rate cards, and returning
 * both is what once rendered every plan twice. */

const FEATURED_SLUG = "cappuccino";

type AltCard = {
  label: string;
  price: string;
  example: string;
  note: string;
};

/* INR figures are authored. USD mirrors are converted once, rounded UP to
 * clean whole numbers ("next big number" - a $444 upper bound invites the
 * negotiation this page refuses), at an assumed ≈₹90/$. */
const ALTERNATIVES_INR: AltCard[] = [
  {
    label: "Agency or job board",
    price: "8.33% of CTC",
    example: "₹50,000",
    note: "On a ₹6,00,000 CTC hire, at an assisted-hire rate.",
  },
  {
    label: "Hiring in-house",
    price: "₹18,000 – ₹40,000",
    example: "₹29,000",
    note: "Recruiter time and three screening rounds, with no comparable signal.",
  },
  {
    label: "Findtern",
    price: "₹0 – ₹200/hr",
    example: "₹16,000",
    note: "160 hours at a mid-band rate, plus a flat fee only below 6/10.",
  },
];

const ALTERNATIVES_USD: AltCard[] = [
  {
    label: "Agency or job board",
    price: "8.33% of CTC",
    example: "$600",
    note: "On a $7,000 CTC hire, at an assisted-hire rate.",
  },
  {
    label: "Hiring in-house",
    price: "$200 – $500",
    example: "$350",
    note: "Recruiter time and three screening rounds, with no comparable signal.",
  },
  {
    label: "Findtern",
    price: "$0 – $2/hr",
    example: "$160",
    note: "160 hours at a mid-band rate, plus a flat fee only below 6/10.",
  },
];

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
    plans.findIndex((p) => p.slug === FEATURED_SLUG),
  );
  const alternatives = isIndia ? ALTERNATIVES_INR : ALTERNATIVES_USD;

  const MATRIX = [
    { label: "Who is it for", get: (p: CmsPlan) => p.features[0] ?? "-" },
    { label: "Findtern Score", get: (p: CmsPlan) => p.features[1] ?? "-" },
    {
      label: "Per hiring charge",
      get: (p: CmsPlan) =>
        p.perHireChargeMinor > 0 ? formatMoney(p.perHireChargeMinor, currency) : "Waived",
    },
    {
      label: "Price",
      get: (p: CmsPlan) => formatRate(p.priceHourlyMinor, currency),
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
          {bands.map((band, i) => (
            <TiltCard key={band.id} max={5} className="rounded-2xl">
              <article
                className={cn(
                  "flex h-full flex-col rounded-2xl border bg-white p-6 sm:p-7",
                  i === featuredIdx ? "border-2 border-primary shadow-lg" : "border-ink-200",
                )}
              >
                <span className="inline-flex size-10 items-center justify-center rounded-lg bg-brand-50 text-primary">
                  <Coffee className="size-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink-900">
                  {plans[i]?.displayName ?? band.name}
                </h3>
                <p className="mt-1 text-sm text-ink-500">
                  {band.min}–{band.max}/10
                </p>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-ink-900">
                  {formatRate(band.rateMinor, currency)}
                </p>
                <p className="mt-1.5 text-sm text-ink-500">{band.blurb}</p>
                <p
                  className={cn(
                    "mt-5 flex items-center gap-2 border-t pt-4 text-sm",
                    band.perHireMinor > 0 ? "text-ink-600" : "text-primary",
                  )}
                >
                  {band.perHireMinor > 0 ? (
                    <Minus className="size-4" aria-hidden />
                  ) : (
                    <Check className="size-4" aria-hidden />
                  )}
                  {band.perHireMinor > 0
                    ? `${formatMoney(band.perHireMinor, currency)} per hire`
                    : "No per-hire charge"}
                </p>
              </article>
            </TiltCard>
          ))}
        </div>
      </PageSection>

      {/* ── The comparison matrix ───────────────────────────────────── */}
      <PageSection>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-4xl">
            Compare every attribute
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            This is the whole table. There is no fourth column.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <caption className="sr-only">
                Findtern hiring plans compared across six attributes. Espresso is
                free with a per-hire charge and covers interns scoring under{" "}
                {PER_HIRE_CUTOFF} out of 10. Cappuccino and Latte are billed
                hourly with no per-hire charge.
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
                      <span className="mt-1 block text-sm font-medium text-ink-500">
                        {formatRate(p.priceHourlyMinor, currency)}
                      </span>
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
          {alternatives.map((card) => (
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
                      "No fee at all above 6/10",
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
                  value={0}
                  prefix={currency === "INR" ? "₹" : "$"}
                />
              </p>
              <p className="text-sm text-ink-500">
                per-hire fee once a candidate
                <br />
                scores {PER_HIRE_CUTOFF} or above
              </p>
            </div>
          </div>
          <FaqExplorer
            showSearch={false}
            showChips={false}
            items={[
              {
                id: "p1",
                category: "Pricing",
                question: "Why is there a per-hire fee at all?",
                answer:
                  "It covers our screening cost on candidates you go on to hire. Above a 6 out of 10 those candidates are rare enough that charging a flat fee on top of an hourly rate reads as charging twice for the same thing, so we drop it.",
              },
              {
                id: "p2",
                category: "Pricing",
                question: "Can we negotiate the rate?",
                answer:
                  "No. The rate is the score band, and the band is the score. Negotiating it would mean the published rate card was not the real one.",
              },
              {
                id: "p3",
                category: "Pricing",
                question: "What happens if an intern scores below 6?",
                answer:
                  "They still get scored and still appear in the pool. They sit in the Espresso band, which is free to browse with a per-hire charge on anyone you go on to hire.",
              },
              {
                id: "p4",
                category: "Pricing",
                question: "Is there a minimum engagement length?",
                answer:
                  "The Skilled and Assured bands carry a 160-hour minimum, roughly four full working weeks. Below that neither side gets enough from the placement to make it worth doing.",
              },
              {
                id: "p5",
                category: "Pricing",
                question: "Do you charge for the trial period?",
                answer:
                  "No. The scope agreed in the proposal is the scope billed. If work happens outside it, it is not billed - the timesheet is the contract.",
              },
            ]}
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
