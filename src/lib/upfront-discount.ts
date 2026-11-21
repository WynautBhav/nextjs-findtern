import { z } from "zod";

/**
 * The upfront discount: an internship of `minMonths` months or more, paid in full upfront, gets `percent` off its
 * monthly charges. The one-time hiring fee is never discounted, so it is always paid in full. Monthly and post-paid
 * payments get no discount. INR and USD alike. Admin edits the rule (Pricing); the order records what it took off
 * (`notes.upfrontDiscountMinor`), so a later change never alters a paid order, its invoice or its ledger.
 */

export const UPFRONT_DISCOUNT_KEY = "upfront_discount";

export type UpfrontDiscount = { enabled: boolean; percent: number; minMonths: number };

export const UPFRONT_DISCOUNT_DEFAULT: UpfrontDiscount = { enabled: true, percent: 10, minMonths: 3 };

export const MAX_UPFRONT_PERCENT = 50;
export const MAX_UPFRONT_MIN_MONTHS = 12;

const validPercent = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_UPFRONT_PERCENT;
const validMonths = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_UPFRONT_MIN_MONTHS;

/** The stored value, tolerant of anything (missing row, JSON string, partial object): each field falls back on its own. */
export function parseUpfrontDiscount(raw: unknown): UpfrontDiscount {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return { ...UPFRONT_DISCOUNT_DEFAULT };
    }
  }
  const out = { ...UPFRONT_DISCOUNT_DEFAULT };
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.enabled === "boolean") out.enabled = o.enabled;
    if (validPercent(o.percent)) out.percent = o.percent;
    if (validMonths(o.minMonths)) out.minMonths = o.minMonths;
  }
  return out;
}

/** Whether an internship of `months` months qualifies when paid upfront. */
export function upfrontDiscountApplies(months: number, rule: UpfrontDiscount | null | undefined): boolean {
  return Boolean(rule?.enabled) && validPercent(rule!.percent) && Number.isFinite(months) && months >= rule!.minMonths;
}

/** What the rule takes off the monthly charges (`engagementMinor`, the fee excluded), rounded to a whole minor unit. */
export function upfrontDiscountMinor(engagementMinor: number, months: number, rule: UpfrontDiscount | null | undefined): number {
  if (!upfrontDiscountApplies(months, rule) || !(engagementMinor > 0)) return 0;
  return Math.round((engagementMinor * rule!.percent) / 100);
}

/** The discount a paid order recorded for one hire (`notes.upfrontDiscountMinor[proposalId]`); 0 when none. */
export function recordedUpfrontDiscountOf(raw: unknown, proposalId: string): number {
  const r = (raw ?? {}) as { notes?: unknown; order?: { notes?: unknown } };
  const notes = (r.notes ?? r.order?.notes ?? {}) as { upfrontDiscountMinor?: Record<string, unknown> };
  const n = Number(notes.upfrontDiscountMinor?.[proposalId]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** The admin PUT body: `{ upfrontDiscount: { enabled, percent, minMonths } }`. Strict, so a typo never leaves a field unchanged. */
export const upfrontDiscountBodySchema = z.strictObject(
  {
    upfrontDiscount: z.strictObject(
      {
        enabled: z.boolean({ message: "The discount must be on or off." }),
        percent: z.number().int().min(1, "The discount must be at least 1%.").max(MAX_UPFRONT_PERCENT, `The discount can be at most ${MAX_UPFRONT_PERCENT}%.`),
        minMonths: z.number().int().min(1, "The minimum length must be at least 1 month.").max(MAX_UPFRONT_MIN_MONTHS, `The minimum length can be at most ${MAX_UPFRONT_MIN_MONTHS} months.`),
      },
      { message: "Send enabled, percent and minMonths." },
    ),
  },
  { message: "Invalid input" },
);

export function isUpfrontDiscountBody(body: unknown): boolean {
  return Boolean(body) && typeof body === "object" && !Array.isArray(body) && "upfrontDiscount" in (body as object);
}

/** The editor's draft: the switch, and the two numbers as typed. */
export type UpfrontDiscountDraft = { enabled: boolean; percent: string; minMonths: string };

export const upfrontDraftOf = (r: UpfrontDiscount): UpfrontDiscountDraft => ({ enabled: r.enabled, percent: String(r.percent), minMonths: String(r.minMonths) });

export const upfrontDraftEq = (a: UpfrontDiscountDraft, b: UpfrontDiscountDraft) => a.enabled === b.enabled && a.percent.trim() === b.percent.trim() && a.minMonths.trim() === b.minMonths.trim();

/** A draft the admin may save, or the field that is wrong and why. Same bounds as the PUT body. */
export function validateUpfrontDraft(d: UpfrontDiscountDraft): { ok: true; rule: UpfrontDiscount } | { ok: false; field: "percent" | "minMonths"; message: string } {
  const percent = Number(d.percent.trim());
  if (!/^\d+$/.test(d.percent.trim()) || !validPercent(percent)) return { ok: false, field: "percent", message: `Enter a whole percent from 1 to ${MAX_UPFRONT_PERCENT}.` };
  const minMonths = Number(d.minMonths.trim());
  if (!/^\d+$/.test(d.minMonths.trim()) || !validMonths(minMonths)) return { ok: false, field: "minMonths", message: `Enter a whole number of months from 1 to ${MAX_UPFRONT_MIN_MONTHS}.` };
  return { ok: true, rule: { enabled: d.enabled, percent, minMonths } };
}
