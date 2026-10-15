import { CountUp } from "@/components/motion/count-up";

/**
 * These are the numbers Findtern can actually stand behind, and each one is a
 * product term rather than a marketing number:
 *
 *   - 18 months is the placement guarantee window (see
 *     /guaranteed-internship-program).
 *   - 3 pricing plans (Espresso, Cappuccino, Latte) come from the pricing
 *     table the site actually renders.
 *   - ₹0 per-hire above a 6/10 Findtern Score is what Cappuccino and Latte
 *     charge.
 *
 * The previous band here read "1,200+ interns placed", "340+ hiring
 * companies" and "4.8/5 average rating". None of those were sourced - the live
 * site publishes no placement counts - and publishing an invented placement
 * number is the kind of claim that does not survive a journalist or a large
 * employer's due diligence. If real figures exist, they belong in the CMS
 * (stats are content, like every other number on this site) and this band
 * should read them from there rather than hardcode them.
 */
const STATS = [
  { value: 18, prefix: "", suffix: " mo", label: "Placement guarantee" },
  { value: 3, prefix: "", suffix: "", label: "Plans, no lock-in" },
  { value: 0, prefix: "₹", suffix: "", label: "Per-hire above 6/10" },
];

/**
 * Dark metrics band. Breaks the light rhythm of the page and gives the
 * numbers room to read as proof rather than decoration.
 */
export function StatsBand() {
  return (
    <section className="bg-brand-950 py-16 sm:py-20">
      <div className="container-page">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="border-l border-white/10 pl-5">
              <dd className="flex items-baseline gap-0.5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {s.prefix ? (
                  <span className="text-xl font-medium text-accent-400 sm:text-2xl">{s.prefix}</span>
                ) : null}
                <CountUp value={s.value} decimals={0} />
                {s.suffix ? (
                  <span className="text-xl font-medium text-accent-400 sm:text-2xl">{s.suffix}</span>
                ) : null}
              </dd>
              <dt className="mt-2 block text-sm text-on-dark-subtle">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
