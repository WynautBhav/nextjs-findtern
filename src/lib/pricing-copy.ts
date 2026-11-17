import { formatMoney, formatRate } from "./format.ts";
import { planMonthMinor } from "./plan-offer.ts";
import { bandById, bandMoneyFor, feeSettingOf, type BandId, type PricingConfig } from "./pricing-config.ts";
import { feePlans, joinNames } from "./per-hire-copy.ts";

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

/** The intern-side money lines for llms.txt, from the config: the AI interview fee and the fixed monthly stipends. */
export function llmsInternMoneyLines(config: PricingConfig): string[] {
  const skilled = stipendText(config, "skilled");
  const assured = stipendText(config, "assured");
  const stipends = [skilled ? `${skilled} a month at a score of 6 to 8` : null, assured ? `${assured} a month at 8 to 10` : null].filter(Boolean);
  return [
    `- Candidate AI interview fee: ${activationFeeText(config)} one-time, paid by the candidate (INR)`,
    stipends.length
      ? `- Intern stipend: a fixed monthly stipend of ${stipends.join(" and ")}; none below a score of 6`
      : "- Intern stipend: none is currently published",
  ];
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
  const { charged, free } = feePlans(feeSettingOf(config));
  const fee = hireFeeText(config).inr;
  if (charged.length === 0) return "no per-hire fee for now";
  if (free.length === 0) return `a ${fee} per-hire fee on every plan`;
  return `a ${fee} per-hire fee on ${joinNames(charged)} (free for now on ${joinNames(free)})`;
}
