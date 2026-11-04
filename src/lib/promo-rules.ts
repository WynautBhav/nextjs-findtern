/**
 * Promo code rules, pure - no DB, safe for `node --test`.
 *
 * Units, as the admin form writes them: a fixed `discountValue` and
 * `minOrderAmountMinor` are both paise (the form multiplies rupees by 100). A USD order converts both at the
 * same ₹100 = $1 rule as every price, so one code works for both regions.
 */
import { sql } from "drizzle-orm";

import { inrMinorToUsdMinor } from "./currency.ts";
import { formatMoney } from "./format.ts";

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

export type PromoAudience = "intern" | "employer";
export const PROMO_APPLIES_TO = ["intern", "employer", "both"] as const;
export type PromoAppliesTo = (typeof PROMO_APPLIES_TO)[number];

/** Why a code cannot be redeemed by this kind of account, or null. */
export function promoAudienceProblem(appliesTo: string | null | undefined, audience: PromoAudience): string | null {
  const scope = appliesTo ?? "both";
  if (scope === "both" || scope === audience) return null;
  return audience === "employer" ? "This code is for interns only" : "This code is for companies only";
}

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
  next: { discountType?: string; discountValue?: number; appliesTo?: string; maxUsages?: number | null },
): string | null {
  if (!existing?.collegeId) return null;
  const changed =
    (next.discountType !== undefined && next.discountType !== existing.discountType) ||
    (next.discountValue !== undefined && next.discountValue !== existing.discountValue) ||
    (next.appliesTo !== undefined && next.appliesTo !== (existing.appliesTo ?? "both")) ||
    (next.maxUsages !== undefined && next.maxUsages !== existing.maxUsages);
  return changed ? COLLEGE_CODE_LOCKED : null;
}

export const COLLEGE_CODE_UNDELETABLE = "This is a college's code. College codes are managed on the Colleges screen.";

/** A college's code is never deleted on its own; it is managed on the Colleges screen. */
export const collegeCodeDeleteProblem = (collegeId: string | null | undefined): string | null => (collegeId ? COLLEGE_CODE_UNDELETABLE : null);

/** Admin input: the window must not end before it starts. */
export function promoWindowProblem(validFrom: Date | null, validUntil: Date | null): string | null {
  if (validFrom && validUntil && validUntil < validFrom) return "The end date must be on or after the start date";
  return null;
}

function inCurrency(inrMinor: number, currency: Currency): number {
  return currency === "USD" ? inrMinorToUsdMinor(inrMinor) : inrMinor;
}

export const SEATS_USED_UP = "This college's free seats are used up";
export const DEFAULT_COLLEGE_SEATS = 300;

/** Admin edits a college's cap: a whole number of at least 1, never below the seats already used. */
export function seatCapProblem(cap: number, usedCount: number): string | null {
  if (!Number.isInteger(cap) || cap < 1) return "The cap must be a whole number of at least 1";
  return cap < usedCount ? `${usedCount} seats are already used; the cap can't go below that` : null;
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
  if (row.maxUsages && row.usedCount >= row.maxUsages) return row.collegeId ? SEATS_USED_UP : "Promo code exhausted";
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
  const raw =
    row.discountType === "percentage"
      ? Math.floor((orderMinor * Math.min(row.discountValue, 100)) / 100) // legacy rounds down
      : inCurrency(row.discountValue, currency); // fixed: paise, as the legacy app stores it
  return Math.max(0, Math.min(raw, orderMinor));
}
