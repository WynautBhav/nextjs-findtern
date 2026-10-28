import { CountUp } from "@/components/motion/count-up";
import { PerHireFigure } from "@/components/marketing/region-rates";
import { PROOF_STATS as STATS } from "@/lib/content/site";

/**
 * These are the numbers Findtern can actually stand behind, and each one is a
 * product term rather than a marketing number, all three addressed to the
 * employer the rest of the home page is talking to:
 *
 *   - 100% of profiles are verified, interviewed and tested before an
 *     employer sees them.
 *   - 3 pricing plans (Espresso, Cappuccino, Latte) come from the pricing
 *   - ₹5,000 fixed per-hire fee applies across all plans.
 *
 * The candidate guarantee ("refund if not placed") used to sit here between
 * two employer terms; it now lives on /interns with the rest of the
 * candidate pitch. The previous band before that read "1,200+ interns
 * placed", "340+ hiring companies" and "4.8/5 average rating". None of those
 * were sourced - the live site publishes no placement counts - and publishing
 * an invented placement number is the kind of claim that does not survive a
 * journalist or a large employer's due diligence. If real figures exist, they
 * belong in the CMS and this band should read them from there.
 */

/**
 * Dark metrics band. Breaks the light rhythm of the page and gives the
 * numbers room to read as proof rather than decoration.
 */
export function StatsBand() {
  return (
    <section className="bg-brand-950 py-10 sm:py-16 lg:py-20">
      <div className="container-page">
        <dl className="grid grid-cols-3 divide-x divide-white/10 sm:divide-x-0 sm:gap-x-8 sm:gap-y-10 lg:gap-x-12">
          {STATS.map((s) => (
            <div key={s.label} className="px-2 text-center sm:border-l sm:border-white/10 sm:px-0 sm:pl-5 sm:text-left">
              <dd className="flex items-baseline justify-center sm:justify-start gap-0.5 text-2xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
                {"perHire" in s ? (
                  <PerHireFigure prefixClassName="text-xs font-medium text-accent-400 sm:text-2xl" />
                ) : (
                  <>
                    {String(s.prefix) ? (
                      <span className="text-xs font-medium text-accent-400 sm:text-2xl">{s.prefix}</span>
                    ) : null}
                    <CountUp value={s.value} decimals={0} />
                  </>
                )}
                {s.suffix ? (
                  <span className="text-xs font-medium text-accent-400 sm:text-2xl">{s.suffix}</span>
                ) : null}
              </dd>
              <dt className="mt-1 sm:mt-2 block text-[11px] sm:text-sm text-on-dark-subtle leading-tight">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
