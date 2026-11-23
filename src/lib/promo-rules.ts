/**
 * Promo code rules, pure - no DB, safe for `node --test`.
 *
 * Units, as the admin form writes them: a fixed `discountValue` and
 * `minOrderAmountMinor` are both paise (the form multiplies rupees by 100). A USD order converts both at the
 * same ₹100 = $1 rule as every price, so one code works for both regions.
 */
import { sql } from "drizzle-orm";

import { inrMinorToUsdMinor } from "./currency.ts";
import { FULL_WAIVER_TYPE } from "./full-waiver.ts";
import { formatMoney } from "./format.ts";
import { PROMO_APPLIES_TO, promoAudienceProblem, type PromoAppliesTo, type PromoAudience } from "./promo-scope.ts";

export type PromoRow = {
  code: string;
  discountType: string;
  discountValue: number;
  maxUsages: number | null;
  usedCount: number;
  minOrderAmountMinor: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  isActive: boolean;
  /** Set on a per-college TPO code: its cap is that college's free seats. */
  collegeId?: string | null;
};

type Currency = "INR" | "USD";

export { PROMO_APPLIES_TO, promoAudienceProblem, type PromoAppliesTo, type PromoAudience };

/**
 * A promo code is for an employer paying the whole engagement upfront, never
 * month by month: the discount comes off the stipend and a later instalment
 * has nothing to take it from. Returns why, or null when the mode is fine.
 */
export function promoModeProblem(mode: "upfront" | "monthly"): string | null {
  return mode === "monthly" ? "Promo codes only work when the whole engagement is paid upfront." : null;
}

/** Shown when the general promo editor is asked to change a college's TPO code terms. */
export const COLLEGE_CODE_LOCKED =
  "This is a college's TPO code. Change its discount, who can use it or its seat cap from the college's page under Colleges.";

type CollegeCodeTerms = { discountType: string; discountValue: number; appliesTo: string | null; maxUsages: number | null };

/**
 * The general promo editor must not touch a college code's discount, audience or
 * seat cap: the cap has its own guard (`seatCapProblem`) on the college screen.
 * `next` holds only what the edit sets (undefined = left as is); a value equal
 * to what the row already has is not a change, so saving other fields still works.
 */
export function collegeCodeEditProblem(
  existing: (CollegeCodeTerms & { collegeId: string | null }) | null,
  next: { discountType?: string; discountValue?: number; appliesTo?: string; maxUsages?: number | null; reusable?: boolean },
): string | null {
  if (!existing?.collegeId) return null;
  const changed =
    // A college code's seats are one per student; a reusable one would let a student spend several.
    next.reusable === true ||
    (next.discountType !== undefined && next.discountType !== existing.discountType) ||
    (next.discountValue !== undefined && next.discountValue !== existing.discountValue) ||
    (next.appliesTo !== undefined && next.appliesTo !== (existing.appliesTo ?? "both")) ||
    (next.maxUsages !== undefined && next.maxUsages !== existing.maxUsages);
  return changed ? COLLEGE_CODE_LOCKED : null;
}

export const COLLEGE_CODE_UNDELETABLE = "This is a college's code. College codes are managed on the Colleges screen.";

/** A college's code is never deleted on its own; it is managed on the Colleges screen. */
export const collegeCodeDeleteProblem = (collegeId: string | null | undefined): string | null => (collegeId ? COLLEGE_CODE_UNDELETABLE : null);

/**
 * An unknown, switched-off or dead code is a refused input, not a missing page: 422, never 404 (B-53). The clients show
 * `error` for any non-OK status, so the message and what the customer sees are unchanged.
 */
export const INVALID_PROMO = Object.freeze({ ok: false as const, error: "Invalid promo code", status: 422 });

/** What a code is right now, for the admin header and toggle. Switched off wins, then expired, then used up (B-28). */
export type PromoState = "active" | "used up" | "expired" | "off";
export function promoState(row: Pick<PromoRow, "isActive" | "validUntil" | "maxUsages" | "usedCount">, now: Date = new Date()): PromoState {
  if (!row.isActive) return "off";
  if (row.validUntil && new Date(row.validUntil) < now) return "expired";
  if (row.maxUsages !== null && row.usedCount >= row.maxUsages) return "used up";
  return "active";
}

/**
 * Admin create/edit: an expiry in the past makes a dead code (B-27). On edit the same value as the row already holds is
 * not a change (an expired code can still be renamed or described), compared to the minute because the form is minute-precise.
 */
export function promoExpiryProblem(next: Date | null | undefined, existing: Date | null = null, now: Date = new Date()): string | null {
  if (!next || next >= now) return null;
  const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
  if (existing && minute(existing) === minute(next)) return null;
  return "The expiry date is in the past. Pick a date and time that hasn't passed yet.";
}

/** Admin input: the window must not end before it starts. */
export function promoWindowProblem(validFrom: Date | null, validUntil: Date | null): string | null {
  if (validFrom && validUntil && validUntil < validFrom) return "The end date must be on or after the start date";
  return null;
}

function inCurrency(inrMinor: number, currency: Currency): number {
  return currency === "USD" ? inrMinorToUsdMinor(inrMinor) : inrMinor;
}

/** A TPO code stops working when its college is switched off or no longer a partner (Q2-A). */
export function collegeCodeProblem(college: { isActive: boolean; isPartner: boolean } | null): string | null {
  return college?.isActive && college.isPartner ? null : "Your college's code is not active. Ask your placement officer.";
}

/**
 * A student who is an active member of one college can't redeem another college's code: paying with it would move them
 * to that college and burn one of its seats. Members of the same college, and students with no college, are fine.
 */
export function collegeCodeMemberProblem(activeMembershipCollegeId: string | null | undefined, promoCollegeId: string): string | null {
  return activeMembershipCollegeId && activeMembershipCollegeId !== promoCollegeId
    ? "This code is for another college. Switch college in Settings first"
    : null;
}

export const SEATS_USED_UP = "This college's free seats are used up";
export const DEFAULT_COLLEGE_SEATS = 300;

/**
 * Admin edits a college's cap: a whole number of at least 0 (a college with no paid batch sits at 0), never below the seats
 * already used and, when `paidSeats` is given, never above the seats paid for (owner rule: no free seats).
 */
export function seatCapProblem(cap: number, usedCount: number, paidSeats?: number): string | null {
  if (!Number.isInteger(cap) || cap < 0) return "The cap must be a whole number, 0 or more";
  if (cap < usedCount) return `${usedCount} seats are already used; the cap can't go below that`;
  return paidSeats !== undefined && cap > paidSeats ? `Only ${paidSeats} seats are paid for; the cap can't go above that. Raise a seat batch instead.` : null;
}

/**
 * The seat increment's WHERE: the row only matches while a seat is free, so
 * two students settling at once can't both take the last one (the loser's
 * UPDATE matches no row). NULL max_usages = unlimited, as everywhere else.
 */
export function seatFreeWhere(promoId: string) {
  return sql`id = ${promoId} AND (max_usages IS NULL OR used_count < max_usages)`;
}

/** Why this code cannot be used on this order, or null when it can. */
export function promoProblem(
  row: PromoRow,
  orderMinor: number,
  currency: Currency,
  now: Date = new Date(),
): string | null {
  if (!row.isActive) return "Invalid promo code";
  if (row.validFrom && row.validFrom > now) return "Promo code is not active yet";
  if (row.validUntil && row.validUntil < now) return "Promo code expired";
  if (row.maxUsages !== null && row.usedCount >= row.maxUsages) return row.collegeId ? SEATS_USED_UP : "Promo code exhausted";
  if (row.minOrderAmountMinor && orderMinor < inCurrency(row.minOrderAmountMinor, currency)) {
    // ADM-14: say what the minimum is, in the order's currency.
    return `This code needs an order of at least ${formatMoney(inCurrency(row.minOrderAmountMinor, currency), currency)}`;
  }
  return null;
}

/** An employer code that discounts the whole stipend (100%, or a fixed amount at or above it): the hiring charge is always paid, so the stipend is too (C1). */
export function employerPromoTooLarge(discountMinor: number, discountableMinor: number): boolean {
  return discountMinor >= discountableMinor;
}

/** Discount in the order's minor units, never more than the order itself. */
export function promoDiscount(row: PromoRow, orderMinor: number, currency: Currency): number {
  // A full waiver is the whole order, whatever `discountValue` says (full-waiver.ts).
  if (row.discountType === FULL_WAIVER_TYPE) return Math.max(0, orderMinor);
  const raw =
    row.discountType === "percentage"
      ? Math.floor((orderMinor * Math.min(row.discountValue, 100)) / 100) // legacy rounds down
      : inCurrency(row.discountValue, currency); // fixed: paise, as the legacy app stores it
  return Math.max(0, Math.min(raw, orderMinor));
}

/** How long an unpaid order holds a use of its code: the same 30 minutes an open order blocks a retry (OPEN_ORDER_MINUTES in payments.ts). */
export const PROMO_HOLD_MINUTES = 30;

/** Admin edit: a cap can't be set below the uses already made. Null (unlimited) is always fine. */
export function promoMaxUsagesProblem(maxUsages: number | null | undefined, usedCount: number): string | null {
  if (maxUsages == null || maxUsages >= usedCount) return null;
  return `Already used ${usedCount} ${usedCount === 1 ? "time" : "times"}; the max can't go below that`;
}

/**
 * A code with history is never deleted: its redemption list is the record behind real orders. Turning it off
 * stops new use and keeps the history. `usageRows` is checked as well as `usedCount`, because the counter can drift.
 */
export function promoDeleteProblem(c: { usedCount: number; usageRows: number; openOrders: number }): string | null {
  const used = Math.max(c.usedCount, c.usageRows);
  if (used > 0) return `This code has been used ${used} ${used === 1 ? "time" : "times"}. Turn it off instead of deleting it, so its history stays.`;
  if (c.openOrders > 0) return "This code is on an open payment. Turn it off, or delete it once that payment closes.";
  return null;
}

/**
 * Consume on paid, hold while a payment is open, release on expiry or failure. `held` is the number of OTHER
 * accounts' open payments carrying this code. A capped code with no use left once holds are counted is refused now,
 * so two payments can't both be taken for the last use.
 */
export function promoHoldProblem(row: { maxUsages: number | null; usedCount: number; collegeId?: string | null }, held: number): string | null {
  if (row.maxUsages === null || row.usedCount + held < row.maxUsages) return null;
  return row.collegeId
    ? "This college's last free seat is on a payment that's still open. Try again in a few minutes."
    : "The last uses of this code are on payments that are still open. Try again in a few minutes.";
}

/**
 * Renaming is refused once a code has history: an open or paid order carries the old name, and settlement and the
 * holds look the code up by that name, so a rename would let a payment take the discount without spending a use.
 */
export function promoRenameProblem(c: { usedCount: number; usageRows: number; openOrders: number }): string | null {
  if (Math.max(c.usedCount, c.usageRows) > 0) return "A code that has been used can't be renamed. Create a new code and turn this one off.";
  if (c.openOrders > 0) return "This code is on an open payment, so it can't be renamed right now.";
  return null;
}
