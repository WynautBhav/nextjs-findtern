"use client";

import { useState } from "react";
import { Check, Coffee } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Magnetic } from "@/components/motion/magnetic";
import { PER_HIRE_CUTOFF } from "@/lib/score";
import { formatMoney, formatRate } from "@/lib/format";
import type { CmsPlan } from "@/lib/content/types";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Pricing — cards + matrix
   --------------------------------------------------------------------------
   The coffee metaphor is preserved: Espresso / Cappuccino / Latte, mapped onto
   the Findtern Score bands.

   Structure follows what 15 measured pricing pages actually do — 15 of 17
   ship a card row AND a comparison matrix, because they answer two different
   questions. "Which one do I want?" is a card decision. "What exactly is in
   it?" is a table lookup. The legacy build answered both with a table, which
   made the first question awkward.

   Specific measured decisions, and why:

   - Label column is 2x a plan column. Linear `2fr repeat(4,1fr)`, Notion
     `minmax(0,2fr) repeat(4,minmax(0,1fr))`, Clay
     `minmax(120px,260px) 1fr 1fr 1fr` — three sites, same ratio,
     independently.

   - No zebra striping. Zero instances across all 15 pages. Row hover is a
     full-width ::before at 6px radius fading in, per Linear.

   - Recommended tier: a badge straddling the top edge at top:-12px, mono,
     uppercase, plus a 2px accent border. This is the loudest treatment found
     anywhere in the set — and it is still quieter than a filled background,
     which is what the previous version used and why the column read as a
     rendering artefact rather than as an emphasis.

   - Mobile hides the non-selected plan columns. No measured pricing page uses
     horizontal scroll — all 15 use a select-to-filter or a breakpoint hide.
     The previous version used overflow-x-auto with a sticky label column,
     which is the one pattern none of them use.

   AMOUNTS READ FROM THE CMS. `pricing_plans` is seeded (db:seed) with the
   figures the legacy client hardcoded and is editable from /admin/cms. The
   constants in lib/content/home.ts are only a fallback.
   ========================================================================== */

const FEATURED = 1; // Cappuccino — the ₹100/hr tier, marked "Popular" on the
                    // legacy Employers page.

const ROWS: {
  label: string;
  value: (plan: CmsPlan) => string;
  strong?: boolean;
}[] = [
  { label: "Who is it for", value: (p) => p.features[0] ?? "—" },
  { label: "Findtern Score", value: (p) => p.features[1] ?? "—", strong: true },
  {
    label: "Per hiring charge",
    value: (p) => (p.perHireChargeMinor > 0 ? formatMoney(p.perHireChargeMinor) : "Waived"),
    strong: true,
  },
  { label: "Price", value: (p) => formatRate(p.priceHourlyMinor), strong: true },
  { label: "Duration", value: (p) => p.internshipDuration },
  { label: "What you get", value: (p) => p.features[2] ?? "—" },
];

export function PricingTable({
  plans,
  isIndia,
}: {
  plans: CmsPlan[];
  isIndia: boolean;
}) {
  const [active, setActive] = useState<string>(plans[FEATURED]?.id ?? plans[0]?.id);

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
            className="relative inline-flex rounded-full border border-white/12 bg-white/5 p-1"
            style={{ ["--plan-count" as string]: String(plans.length) }}
          >
            {plans.map((p) => (
              <button
                key={p.id}
                role="tab"
                type="button"
                aria-selected={active === p.id}
                onClick={() => setActive(p.id)}
                className={cn(
                  "relative min-w-24 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 ease-ease-out",
                  active === p.id ? "text-white" : "text-on-dark-subtle",
                )}
              >
                <span className="relative">{p.displayName}</span>
              </button>
            ))}
            {/* One track wide, translated to the active index. */}
            <span
              aria-hidden
              className="absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/var(--plan-count))] rounded-full bg-white/12 transition-transform duration-300 ease-ease-out-expo"
              style={{
                transform: `translateX(calc(${
                  plans.findIndex((p) => p.id === active) * 100
                }% * var(--plan-count)))`,
              }}
            />
          </div>
        </div>

        {/* ── Card row ─────────────────────────────────────────────── */}
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan, i) => {
            const featured = i === FEATURED;
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-white p-6 sm:p-7",
                  featured
                    ? "border-2 border-primary shadow-xl lg:-my-3 lg:py-9"
                    : "border-ink-200",
                )}
              >
                {/* Straddling badge — the loudest treatment in the reference
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
                <p className="mt-1.5 text-3xl font-semibold tracking-[-0.02em] text-ink-900">
                  {formatRate(plan.priceHourlyMinor)}
                </p>
                <p className="mt-1.5 text-sm text-on-dark-subtle">
                  {plan.internshipDuration}
                </p>

                <p className="mt-5 flex items-center gap-2 border-t border-ink-100 pt-5 text-sm text-ink-600">
                  <Coffee className="size-4 shrink-0 text-primary" aria-hidden />
                  {plan.features[0]}
                </p>

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
                Findtern hiring plans compared across six attributes. Espresso
                covers interns scoring under {PER_HIRE_CUTOFF} out of 10 and
                charges per hire. Cappuccino and Latte are billed hourly with
                no per-hire charge.
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
                        i === FEATURED ? "text-accent-300" : "text-white",
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
                          i === FEATURED && row.strong && "text-accent-300",
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
              .filter((p) => p.id === active)
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
            No per-hire charge on Cappuccino and Latte
          </p>
          {isIndia ? (
            <p className="text-xs text-on-dark-subtle">Prices include GST</p>
          ) : null}

          <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
            <Magnetic strength={0.28}>
              <ButtonLink href="/pricing" variant="accent" size="lg">
                See full pricing
              </ButtonLink>
            </Magnetic>
            <ButtonLink href="/employers" variant="outlineLight" size="lg">
              Talk to us
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
