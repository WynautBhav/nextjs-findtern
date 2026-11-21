import { parseOffer, isPayrollFullTime } from "./offer.ts";

/** Days of Findtern Pro that come with a full-time hire by a company abroad. */
export const FULL_TIME_PRO_DAYS = 365;

type HiredProposal = { id: string; offerDetails: unknown; currency: string | null };

/** The order id of the free Pro grant for one hire: one per proposal, so settling twice never grants twice. */
export const proGrantOrderId = (proposalId: string) => `grant_ft_${proposalId}`;

/**
 * Which of the proposals a paid order just hired earn a year of Pro: the USD full-time ones. An internship or an
 * Indian full-time hire earns none. Pure, so the decision is tested apart from the settlement transaction.
 */
export function proposalsEarningPro(hired: readonly HiredProposal[]): string[] {
  return hired.filter((p) => isPayrollFullTime(parseOffer(p.offerDetails, p.currency))).map((p) => p.id);
}

/**
 * The 0-amount `employer_payments` values that give the year. It is a paid `employer_subscription` row, so
 * `subscriptionState` stacks it after any Pro the company already has; amount 0 means it gets no invoice number.
 */
export function proGrantRow(employerId: string, proposalId: string, now: Date) {
  return {
    employerId,
    gateway: "grant",
    orderId: proGrantOrderId(proposalId),
    amountMinor: 0,
    currency: "USD",
    status: "paid",
    paidAt: now,
    raw: { kind: "employer_subscription", periodDays: FULL_TIME_PRO_DAYS, source: "full_time_hire", proposalId },
  };
}
