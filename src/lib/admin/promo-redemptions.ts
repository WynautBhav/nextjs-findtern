/** Promo redemption reporting and list helpers, pure: no DB, safe for `node --test`. */
import { INR_PER_USD } from "../currency.ts";
import { formatIstStamp } from "../format.ts";
import { toCsv } from "./csv.ts";

export type Redemption = {
  who: string | null;
  email: string | null;
  kind: "employer" | "intern";
  orderId: string | null;
  currency: "INR" | "USD";
  /** What the order charged, in `currency` minor units (null when the order row is gone). */
  orderAmountMinor: number | null;
  /** Discount given, in `currency` minor units. */
  discountMinor: number;
  redeemedAt: Date | null;
};

/** Total discount given in INR paise; a USD order's cents convert at the business rule of ₹100 per $1. */
export function totalDiscountInrMinor(rows: Pick<Redemption, "currency" | "discountMinor">[]): number {
  return rows.reduce((sum, r) => sum + (r.currency === "USD" ? r.discountMinor * INR_PER_USD : r.discountMinor), 0);
}

const major = (minor: number | null) => (minor === null ? "" : (minor / 100).toFixed(2));

export function promoRedemptionsCsv(code: string, rows: Redemption[]): string {
  return toCsv(rows, [
    { header: "Code", value: () => code },
    { header: "Redeemed at (IST)", value: (r) => formatIstStamp(r.redeemedAt) },
    { header: "Who", value: (r) => r.who ?? "" },
    { header: "Email", value: (r) => r.email ?? "" },
    { header: "Type", value: (r) => (r.kind === "employer" ? "Company" : "Intern") },
    { header: "Order id", value: (r) => r.orderId ?? "" },
    { header: "Currency", value: (r) => r.currency },
    { header: "Order amount", value: (r) => major(r.orderAmountMinor) },
    { header: "Discount", value: (r) => major(r.discountMinor) },
  ]);
}

export type PromoListRow = { code: string; usedCount: number; validUntil: Date | string | null; createdAt: Date | string | null };
export type PromoSort = "newest" | "used" | "code" | "ending";

const time = (v: Date | string | null) => (v ? new Date(v).getTime() : null);

/** A sorted copy. "Ending soonest" puts codes with no end date last. */
export function sortPromos<T extends PromoListRow>(rows: T[], sort: PromoSort): T[] {
  const copy = [...rows];
  switch (sort) {
    case "used":
      return copy.sort((a, b) => b.usedCount - a.usedCount || a.code.localeCompare(b.code));
    case "code":
      return copy.sort((a, b) => a.code.localeCompare(b.code));
    case "ending":
      return copy.sort((a, b) => (time(a.validUntil) ?? Infinity) - (time(b.validUntil) ?? Infinity) || a.code.localeCompare(b.code));
    default:
      return copy.sort((a, b) => (time(b.createdAt) ?? 0) - (time(a.createdAt) ?? 0));
  }
}

export function paginate<T>(items: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page: p, pages, from: slice.length ? start + 1 : 0, to: start + slice.length, total: items.length };
}
