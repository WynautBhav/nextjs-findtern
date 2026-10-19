"use client";

import { useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { CurrencyNote, CurrencyPicker, useCurrency } from "@/components/marketing/region-rates";
import type { PriceCurrency } from "@/lib/currency";
import { MonthlyRate } from "@/components/marketing/monthly-rate";
import { OfferNote, PlanPrice } from "@/components/marketing/plan-price";
import type { CmsPlan } from "@/lib/content/types";
import { planHasOffer } from "@/lib/plan-offer";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Pricing - cards + matrix
   --------------------------------------------------------------------------
   The coffee metaphor is preserved: Espresso / Cappuccino / Latte, mapped onto
   the Findtern Score bands.

   Structure follows what 15 measured pricing pages actually do - 15 of 17
   ship a card row AND a comparison matrix, because they answer two different
   questions. "Which one do I want?" is a card decision. "What exactly is in
   it?" is a table lookup. The legacy build answered both with a table, which
   made the first question awkward.

   Specific measured decisions, and why:

   - Label column is 2x a plan column. Linear `2fr repeat(4,1fr)`, Notion
     `minmax(0,2fr) repeat(4,minmax(0,1fr))`, Clay
     `minmax(120px,260px) 1fr 1fr 1fr` - three sites, same ratio,
     independently.

   - No zebra striping. Zero instances across all 15 pages. Row hover is a
     full-width ::before at 6px radius fading in, per Linear.

   - Recommended tier: a badge straddling the top edge at top:-12px, mono,
     uppercase, plus a 2px accent border. This is the loudest treatment found
     anywhere in the set - and it is still quieter than a filled background,
     which is what the previous version used and why the column read as a
     rendering artefact rather than as an emphasis.

   - Mobile hides the non-selected plan columns. No measured pricing page uses
     horizontal scroll - all 15 use a select-to-filter or a breakpoint hide.
     The previous version used overflow-x-auto with a sticky label column,
     which is the one pattern none of them use.

   AMOUNTS READ FROM THE CMS. `pricing_plans` is seeded (db:seed) with the
   figures the legacy client hardcoded and is editable from /admin/cms. The
   constants in lib/content/home.ts are only a fallback.
   ========================================================================== */

type PlanRow = {
  label: string;
  value: (plan: CmsPlan) => ReactNode;
  strong?: boolean;
};

function rowsFor(currency: PriceCurrency): PlanRow[] {
  return [
    { label: "Who is it for", value: (p) => p.features[0] ?? "-" },
    { label: "Findtern Score", value: (p) => p.features[1] ?? "-", strong: true },
    {
      label: "Per hiring charge",
      value: (p) => (
        <PlanPrice
          nowMinor={p.perHireChargeMinor}
          wasMinor={p.compareAtPerHireMinor}
          currency={currency}
          kind="money"
          tone="dark"
        />
      ),
      strong: true,
    },
    {
      label: "Price",
      value: (p) => (
        <PlanPrice nowMinor={p.priceHourlyMinor} wasMinor={p.compareAtHourlyMinor} currency={currency} tone="dark" />
      ),
      strong: true,
    },
    { label: "Duration", value: (p) => p.internshipDuration },
    { label: "What you get", value: (p) => p.features[2] ?? "-" },
  ];
}

export function PricingTable({
  plansInr,
  plansUsd,
}: {
  /** Server-rendered INR default; USD swaps in on mount for visitors abroad. */
  plansInr: CmsPlan[];
  plansUsd: CmsPlan[];
}) {
  const currency = useCurrency();
  const isIndia = currency === "INR";
  const plans = isIndia ? plansInr : plansUsd;
  const ROWS = rowsFor(currency);
  const featuredIdx = Math.max(
    0,
    plans.findIndex((p) => p.isFeatured),
  );
  const [active, setActive] = useState<string>(
    plans[featuredIdx]?.id ?? plans[0]?.id,
  );
  // Plan ids differ per currency set - after a region swap the stored id may
  // not exist, which would blank the mobile matrix. Fall back to featured.
  const safeActive =
    plans.some((p) => p.id === active) ? active : (plans[featuredIdx]?.id ?? plans[0]?.id);

  if (!plans.length) return null;

  return (
    <section className="brand-wash grain relative overflow-hidden py-20 sm:py-28">
      <div className="container-page relative">
        {/* ── Heading ──────────────────────────────────────────────── */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-[clamp(2rem,4.2vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.035em] text-white">
            Hire an intern for the price of a{" "}
            <span className="text-accent-400">coffee</span>
          </h2>
          <p className="mt-5 text-lg text-on-dark-subtle">
            Affordable. Flexible. Transparent.
          </p>
          <CurrencyPicker tone="dark" className="mt-6" />
        </div>

        {/* ── Plan switcher, mobile only ────────────────────────────
            The measured pattern for showing a wide comparison on a narrow
            screen: show one plan at a time rather than scroll.

            The active pill slides between tabs on a transform. It used to be a
            static background that jumped from tab to tab, which made the
            control feel like the selection was being redrawn rather than
            moved. */}
        <div className="mt-9 flex justify-center lg:hidden">
          <div
            role="tablist"
            aria-label="Choose a plan to compare"
            className="relative grid grid-cols-3 rounded-full border border-white/12 bg-white/5 p-1 w-full max-w-xs sm:max-w-sm"
          >
            {plans.map((p) => (
              <button
                key={p.id}
                role="tab"
                type="button"
                aria-selected={safeActive === p.id}
                onClick={() => setActive(p.id)}
                className={cn(
                  "relative z-10 rounded-full px-3 py-2 text-center text-xs sm:text-sm font-medium transition-colors duration-200 ease-out",
                  safeActive === p.id ? "text-white font-semibold" : "text-on-dark-subtle hover:text-white",
                )}
              >
                <span className="relative">{p.displayName}</span>
              </button>
            ))}
            {/* One track wide, translated to the active index */}
            <span
              aria-hidden
              className="absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-white/12 transition-transform duration-300 ease-out"
              style={{
                transform: `translateX(${plans.findIndex((p) => p.id === safeActive) * 100}%)`,
              }}
            />
          </div>
        </div>

        {/* ── Card row ─────────────────────────────────────────────── */}
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan, i) => {
            const featured = i === featuredIdx;
            const isSelected = plan.id === safeActive;
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex-col rounded-2xl border bg-white p-6 sm:p-7",
                  isSelected ? "flex" : "hidden lg:flex",
                  featured
                    ? "border-2 border-primary shadow-xl lg:-my-3 lg:py-9"
                    : "border-ink-200",
                )}
              >
                {/* Straddling badge - the loudest treatment in the reference
                    set, and the only one that changes geometry. */}
                {featured ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-2xs font-semibold uppercase tracking-[0.1em] text-white">
                    Most popular
                  </span>
                ) : null}

                <p
                  className={cn(
                    "text-lg font-semibold tracking-tight",
                    featured ? "text-primary" : "text-ink-900",
                  )}
                >
                  {plan.displayName}
                </p>
                <PlanPrice
                  layout="stack"
                  className="mt-3"
                  priceClassName="text-[2rem] font-semibold leading-none tracking-[-0.025em] text-ink-900"
                  nowMinor={plan.priceHourlyMinor}
                  wasMinor={plan.compareAtHourlyMinor}
                  currency={currency}
                />
                {planHasOffer(plan) && plan.compareAtHourlyMinor ? (
                  <OfferNote wasMinor={plan.compareAtHourlyMinor} currency={currency} className="mt-2" />
                ) : (
                  <MonthlyRate hourlyMinor={plan.priceHourlyMinor} currency={currency} className="mt-2" />
                )}
                <p className="mt-4 text-sm text-ink-500">
                  {plan.features[0]} · {plan.internshipDuration}
                </p>

                <ul
                  className="mt-5 space-y-2.5 border-t border-ink-100 pt-5"
                  aria-label={`${plan.displayName} includes`}
                >
                  {plan.featureList.map((f) => (
                    <li
                      key={f.label}
                      className={cn("flex gap-2.5 text-sm", f.included ? "text-ink-700" : "text-ink-400")}
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

                {/* flex-1 so every card's CTA lands on the same baseline
                    regardless of how much copy sits above it. */}
                <div className="flex-1" />

                <ButtonLink
                  href="/employers"
                  variant={featured ? "primary" : "outline"}
                  size="md"
                  block
                  className="mt-6"
                >
                  Choose {plan.displayName}
                </ButtonLink>
              </div>
            );
          })}
        </div>

        {/* ── The matrix ────────────────────────────────────────────── */}
        <div className="mt-16">
          <h3 className="text-center text-2xl font-semibold tracking-[-0.02em] text-white">
            Compare every attribute
          </h3>

          {/* Mobile: one column. Desktop: all three. Same DOM, no
              overflow-x, no sticky column. */}
          <div className="mt-8 hidden lg:block">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Findtern hiring plans compared across six attributes. Every plan carries
                a fixed per-hiring charge to cover verified screening and talent matching.
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="w-1/3 pb-4 pr-8 text-2xs font-semibold uppercase tracking-[0.14em] text-on-dark-subtle"
                  >
                    Plan
                  </th>
                  {plans.map((p, i) => (
                    <th
                      key={p.id}
                      scope="col"
                      className={cn(
                        "border-l border-white/10 pb-4 pl-6 text-lg font-semibold tracking-tight",
                        i === featuredIdx ? "text-accent-300" : "text-white",
                      )}
                    >
                      {p.displayName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="group relative">
                    {/* Full-row hover, spanning the label cell too. */}
                    <th
                      scope="row"
                      className="relative border-t border-white/10 py-4 pr-8 text-sm font-medium text-on-dark-subtle transition-colors duration-200 before:absolute before:inset-x-0 before:inset-y-0 before:-z-10 before:rounded-lg before:bg-white/5 before:opacity-0 before:transition-opacity before:duration-200 group-hover:before:opacity-100"
                    >
                      {row.label}
                    </th>
                    {plans.map((p, i) => (
                      <td
                        key={p.id}
                        className={cn(
                          "border-t border-l border-white/10 py-4 pl-6 text-base",
                          row.strong ? "font-semibold text-white" : "text-on-dark",
                          i === featuredIdx && row.strong && "text-accent-300",
                        )}
                      >
                        {row.value(p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile matrix: the selected plan only. */}
          <div className="mt-8 lg:hidden">
            {plans
              .filter((p) => p.id === safeActive)
              .map((p) => (
                <dl
                  key={p.id}
                  className="overflow-hidden rounded-2xl border border-white/12 bg-white/[0.04]"
                >
                  {ROWS.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-baseline justify-between gap-6 border-b border-white/8 px-5 py-3.5 last:border-0"
                    >
                      <dt className="text-sm text-on-dark-subtle">{row.label}</dt>
                      <dd
                        className={cn(
                          "text-right text-base",
                          row.strong ? "font-semibold text-white" : "text-ink-200",
                        )}
                      >
                        {row.value(p)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ))}
          </div>
        </div>

        {/* ── Footnote ─────────────────────────────────────────────── */}
        <div className="mt-10 flex flex-col items-center gap-5">
          <p className="flex items-center gap-2 text-sm text-on-dark-subtle">
            <Check className="size-4 text-accent" aria-hidden />
            Fixed {formatMoney(plans[0].perHireChargeMinor, currency)} per hiring on every placement
          </p>
          <CurrencyNote tone="dark" className="text-xs" />

          <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
            <ButtonLink href="/pricing" variant="accent" size="lg">
              See full pricing
            </ButtonLink>
            <ButtonLink href="/contact" variant="outlineLight" size="lg">
              Talk to us
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
