import { FEE_BANDS, FEE_BAND_LABEL, type PerHireFeeSetting } from "./per-hire-fee.ts";

/**
 * Public copy for the one-time hiring fee, derived from the single admin
 * setting (per-hire-fee.ts) so no page words it differently from what is
 * billed. Pure: safe for `node --test` and for client components.
 */

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Plan names (Espresso, Cappuccino, Latte) split by whether the fee is charged. */
export function feePlans(setting: PerHireFeeSetting): { charged: string[]; free: string[] } {
  return {
    charged: FEE_BANDS.filter((b) => setting[b]).map((b) => FEE_BAND_LABEL[b].plan),
    free: FEE_BANDS.filter((b) => !setting[b]).map((b) => FEE_BAND_LABEL[b].plan),
  };
}

/** "₹5,000 per hiring on Espresso; free for now on Cappuccino and Latte". */
export function perHireFootnote(setting: PerHireFeeSetting, amount: string): string {
  const { charged, free } = feePlans(setting);
  if (charged.length === 0) return "No per-hiring charge for now on any plan";
  if (free.length === 0) return `${amount} per hiring on every plan`;
  return `${amount} per hiring on ${joinNames(charged)}; free for now on ${joinNames(free)}`;
}

/** The sentence under the pricing tables, for screen readers and the FAQ. */
export function perHireCaption(setting: PerHireFeeSetting): string {
  const { charged, free } = feePlans(setting);
  if (charged.length === 0) return "There is no per-hiring charge for now on any plan.";
  if (free.length === 0) return `${joinNames(charged)} carry a fixed per-hiring charge to cover verified screening and talent matching.`;
  return `${joinNames(charged)} ${charged.length === 1 ? "carries" : "carry"} a fixed per-hiring charge to cover verified screening and talent matching; it is free for now on ${joinNames(free)}.`;
}

/** The two-line figure caption beside the fee amount: ["per-hire fee on Espresso", "free for now on Cappuccino and Latte"]. */
export function perHireStatLines(setting: PerHireFeeSetting): [string, string | null] {
  const { charged, free } = feePlans(setting);
  if (charged.length === 0) return ["per-hire fee, free for now", null];
  return [`per-hire fee on ${joinNames(charged)}`, free.length ? `free for now on ${joinNames(free)}` : null];
}

/** A short clause for meta text and prose: "a ₹5,000 per-hire fee on Espresso (free for now on Cappuccino and Latte)". */
export function perHireClause(setting: PerHireFeeSetting, amount: string): string {
  const { charged, free } = feePlans(setting);
  if (charged.length === 0) return "no per-hire fee for now";
  if (free.length === 0) return `a ${amount} per-hire fee on every plan`;
  return `a ${amount} per-hire fee on ${joinNames(charged)} (free for now on ${joinNames(free)})`;
}

/** The FAQ answer to "What is the per-hire fee?". */
export function perHireAnswer(amount: string, setting: PerHireFeeSetting): string {
  const { charged, free } = feePlans(setting);
  if (charged.length === 0) return "There is no per-hire charge for now: it is free on every plan.";
  const base = `${joinNames(charged)} ${charged.length === 1 ? "carries" : "carry"} a fixed ${amount} per-hire charge that covers candidate screening, testing, rubric scoring, and ongoing placement management.`;
  return free.length ? `${base} On ${joinNames(free)} the per-hire charge is free for now.` : base;
}

/** The first sentences of the employer "When do I pay?" answer. */
export function perHireEmployerPayAnswer(setting: PerHireFeeSetting): string {
  const { charged, free } = feePlans(setting);
  if (charged.length === 0) return "The per-hire charge is free for now on every plan.";
  if (free.length === 0) return "The fixed ₹5,000 (or $50) per-hire charge is paid when the intern is hired.";
  return `The fixed ₹5,000 (or $50) per-hire charge on ${joinNames(charged)} is paid when the intern is hired; on ${joinNames(free)} the per-hire charge is free for now.`;
}
