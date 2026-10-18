"use client";

import { inrToUsd } from "@/lib/currency";
import { formatMoney, formatRate } from "@/lib/format";
import { useRevealFlag } from "@/lib/motion";
import { HOURS_PER_MONTH } from "@/lib/plan-offer";
import type { CmsPlan } from "@/lib/content/types";
import { cn } from "@/lib/utils";

/**
 * What one hire costs, three ways, as one chart.
 *
 * The previous version put each route in its own card, which left two cards
 * two-thirds empty and asked the reader to compare numbers across a gap. A
 * single bar chart puts the three figures on one axis so the comparison is
 * the picture, and the one fact that matters - the first two figures buy an
 * introduction, the Findtern figure includes the intern's first month of
 * work - is the sentence under it rather than a bullet list.
 *
 * Authored in rupees; USD derives at ₹100 = $1 like every other price. The
 * Findtern row is computed from the live plan rows, so it moves when an
 * admin edits a price. The bars grow in once, on reveal, and not at all
 * under reduced motion (the transition is zeroed in the stylesheet).
 */
type Route = {
  label: string;
  basis: string;
  amountMinor: number;
  note: string;
  findtern?: boolean;
};

function routes(isIndia: boolean, plans: CmsPlan[]): Route[] {
  const currency = isIndia ? "INR" : "USD";
  const minor = (rupees: number) => (isIndia ? rupees : inrToUsd(rupees)) * 100;
  const money = (rupees: number) => formatMoney(minor(rupees), currency);
  const mid = plans.find((p) => p.isFeatured) ?? plans[1] ?? plans[0];
  const findternMinor = mid ? mid.priceHourlyMinor * HOURS_PER_MONTH + mid.perHireChargeMinor : 0;

  return [
    {
      label: "Agency or job board",
      basis: "8.33% of CTC",
      amountMinor: minor(50000),
      note: `On a ${money(600000)} CTC hire, at the assisted-hire rate. Paid before the intern starts.`,
    },
    {
      label: "Hiring in-house",
      basis: `${money(18000)} to ${money(40000)}`,
      amountMinor: minor(29000),
      note: "Recruiter time and three screening rounds, with no comparable score at the end of it.",
    },
    {
      label: mid ? `Findtern, ${mid.displayName}` : "Findtern",
      basis: mid ? formatRate(mid.priceHourlyMinor, currency) : "",
      amountMinor: findternMinor,
      note: mid
        ? `${HOURS_PER_MONTH} hours of work at ${formatRate(mid.priceHourlyMinor, currency)}, plus the ${formatMoney(mid.perHireChargeMinor, currency)} per-hire charge. The stipend is in this number.`
        : "",
      findtern: true,
    },
  ];
}

export function CostComparison({ isIndia, plans }: { isIndia: boolean; plans: CmsPlan[] }) {
  const currency = isIndia ? "INR" : "USD";
  const rows = routes(isIndia, plans);
  const max = Math.max(...rows.map((r) => r.amountMinor), 1);
  const { ref, revealed } = useRevealFlag<HTMLElement>({ threshold: 0.3 });

  return (
    <figure ref={ref} className="mx-auto mt-12 max-w-3xl">
      <figcaption className="flex items-baseline justify-between gap-4 text-sm text-on-dark-subtle">
        <span>What one hire costs, up to the end of the first month</span>
        <span className="tabular-nums">{currency}</span>
      </figcaption>

      <ol className="mt-5 divide-y divide-white/10">
        {rows.map((row, i) => {
          const pct = Math.max(6, Math.round((row.amountMinor / max) * 100));
          return (
            <li key={row.label} className="py-5 first:pt-4 last:pb-4">
              <div className="flex items-baseline justify-between gap-6">
                <p className="min-w-0 text-base text-white">
                  <span className={cn("font-medium", row.findtern && "text-accent-300")}>{row.label}</span>
                  {/* Basis on its own line on phones, inline after a dot elsewhere. */}
                  <span className="block text-sm text-on-dark-subtle sm:inline sm:text-base">
                    <span className="hidden sm:inline"> · </span>
                    {row.basis}
                  </span>
                </p>
                <p
                  className={cn(
                    "shrink-0 text-2xl font-semibold tabular-nums tracking-[-0.02em]",
                    row.findtern ? "text-accent-300" : "text-white",
                  )}
                >
                  {formatMoney(row.amountMinor, currency)}
                </p>
              </div>

              {/* The bar. Width is the data; everything else is one rule. */}
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-[700ms] ease-out-expo",
                    row.findtern ? "bg-accent" : "bg-white/35",
                  )}
                  style={{ width: revealed ? `${pct}%` : "0%", transitionDelay: `${i * 80}ms` }}
                />
              </div>

              <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-on-dark-subtle">{row.note}</p>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 border-t border-white/10 pt-5 text-sm leading-relaxed text-on-dark-subtle">
        The first two figures buy an introduction. The Findtern figure includes the
        intern&rsquo;s first {HOURS_PER_MONTH} hours of work and the stipend that pays for them.
        Convert a hire to full time and 8.33% of CTC applies then, not before.
      </p>
    </figure>
  );
}
