import { formatMoney, formatRate } from "./format.ts";
import { planMonthMinor } from "./plan-offer.ts";
import { bandById, bandMoneyFor, feeSettingOf, type BandId, type PricingConfig } from "./pricing-config.ts";
import { perHireClause } from "./per-hire-copy.ts";

/**
 * The published figures as text, derived from the pricing config: the one place
 * public copy (page meta, FAQ answers, the chatbot's knowledge, llms.txt) gets
 * a number from, so an admin's edit reaches every sentence. Pure: no DB and no
 * framework, safe for `node --test`, server components and client components.
 *
 * Money in INR unless a function says USD; USD is derived at ₹100 = $1 by the
 * config. Wording that is not a figure stays in the callers.
 */

/** "₹2,499": the one-time AI interview fee an intern pays. */
export function activationFeeText(config: PricingConfig): string {
  return formatMoney(config.activationFeeInrMinor, "INR");
}

/** The bands whose hiring fee the copy quotes: those that charge it, else every band (what a switched-on band would carry). */
function quotedFeeBands(config: PricingConfig) {
  const charged = config.bands.filter((b) => b.hireFeeCharged);
  return charged.length ? charged : config.bands;
}

/**
 * "₹5,000" and "$50": the hiring fee the copy quotes, in both billing currencies.
 * One figure when the quoted bands share a fee (today: Espresso's ₹5,000); a
 * "low to high" range when an admin gives them different fees, so no sentence
 * states one band's fee for another.
 */
export function hireFeeText(config: PricingConfig): { inr: string; usd: string } {
  const bands = quotedFeeBands(config);
  const text = (currency: "INR" | "USD") => {
    const fees = bands.map((b) => bandMoneyFor(config, b.id, currency).hireFeeListMinor);
    const lo = Math.min(...fees);
    const hi = Math.max(...fees);
    return lo === hi ? formatMoney(lo, currency) : `${formatMoney(lo, currency)} to ${formatMoney(hi, currency)}`;
  };
  return { inr: text("INR"), usd: text("USD") };
}

/** "₹100/hr", or "free" when the band's rate is 0 (lower case, for the middle of a sentence). */
export function rateText(config: PricingConfig, id: BandId): string {
  const minor = bandById(config, id).hourlyInrMinor;
  return minor > 0 ? formatRate(minor, "INR") : "free";
}

/** "$1/hr" or "$0" for the USD card; the hourly rate derived at ₹100 = $1. */
export function usdRateText(config: PricingConfig, id: BandId): string {
  const minor = bandMoneyFor(config, id, "USD").hourlyMinor;
  return minor > 0 ? formatRate(minor, "USD") : formatMoney(0, "USD", { zeroLabel: false });
}

/** "free to ₹200/hr": the cheapest band's rate to the dearest's, for page meta. */
export function rateRangeText(config: PricingConfig, { capital = false } = {}): string {
  const text = `${rateText(config, "standard")} to ${rateText(config, "assured")}`;
  return capital ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** One band's month on a Monday-to-Friday schedule, in INR: "₹17,600" (rate × 176 billed hours). */
export function monthlyText(config: PricingConfig, id: BandId): string {
  const { monthlyMinor } = planMonthMinor({
    hourlyMinor: bandById(config, id).hourlyInrMinor,
    perHireMinor: 0,
    perHireFree: true,
    schedule: "mon_fri",
  });
  return formatMoney(monthlyMinor, "INR");
}

/** The fixed monthly intern stipend of a band, "₹8,000", or null when the band has none. */
export function stipendText(config: PricingConfig, id: BandId): string | null {
  const minor = bandById(config, id).stipendInrMinor;
  return minor === null ? null : formatMoney(minor, "INR");
}

/**
 * Espresso's rate and fee as the Plans FAQ words it: "The intern’s rate is shown as ₹50/hr but is currently free, plus the
 * ₹5,000 hiring fee." The struck-through rate is the plan's compare-at price; a rate that is not free, no struck-through
 * rate, or a fee that is waived each get a sentence that is still true.
 */
export function espressoPlanSentence(config: PricingConfig): string {
  const band = bandById(config, "standard");
  const rate =
    band.hourlyInrMinor > 0
      ? `The intern’s rate is ${formatRate(band.hourlyInrMinor, "INR")}`
      : band.compareAtHourlyInrMinor && band.compareAtHourlyInrMinor > 0
        ? `The intern’s rate is shown as ${formatRate(band.compareAtHourlyInrMinor, "INR")} but is currently free`
        : "The intern’s rate is currently free";
  const fee = band.hireFeeCharged ? `, plus the ${formatMoney(band.hireFeeInrMinor, "INR")} hiring fee.` : ", and the hiring fee is free for now.";
  return `${rate}${fee}`;
}

/**
 * The intern-side money lines for llms.txt: the AI interview fee only. llms.txt is read by employers'
 * tools and public crawlers, and the owner's rule is that employers never see what an intern is paid,
 * so no stipend or bonus text goes here.
 */
export function llmsInternMoneyLines(config: PricingConfig): string[] {
  return [`- Candidate AI interview fee: ${activationFeeText(config)} one-time, paid by the candidate (INR)`];
}

/** FAQ entries safe for llms.txt: drops any that state intern pay (stipend, completion bonus, payout). */
export function llmsFaqs<T extends { question: string; answer: string }>(faqs: readonly T[]): T[] {
  return faqs.filter((f) => !/stipend|bonus|payout/i.test(`${f.question} ${f.answer}`));
}

/**
 * The pricing sentence in page meta: "Three published plans from free to ₹200/hr, a ₹5,000 per-hire
 * fee on Espresso (free for now on Cappuccino and Latte)". Names the plans that pay the fee from the
 * admin switch, so it cannot disagree with the page body.
 */
export function pricingMetaSentence(config: PricingConfig): string {
  return `Three published plans from ${rateRangeText(config)}, ${perHireMetaClause(config)}`;
}

/** "a ₹5,000 per-hire fee on Espresso (free for now on Cappuccino and Latte)", from the admin switch. */
export function perHireMetaClause(config: PricingConfig): string {
  return perHireClause(feeSettingOf(config), hireFeeText(config).inr);
}
