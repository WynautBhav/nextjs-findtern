/**
 * Formatting helpers.
 *
 * Money arrives in minor units (paise, cents) from the CMS and is divided and
 * formatted here, once. The legacy site inlined this arithmetic in four
 * separate components, which is how the Home pricing section and the Pricing
 * page ended up showing different fallback prices for the same plans.
 *
 * NOTE: this module is imported by server components, so it must stay free
 * of client-only React APIs. The region hook lives in
 * components/marketing/region-rates.tsx instead.
 */

import { DISPLAY_RATES, isConvertedCurrency, type PriceCurrency } from "./currency.ts";

export type Currency = "INR" | "USD";

/**
 * The one money formatter. `minor` is paise/cents.
 * - zeroLabel: text for 0 (default "Free"); pass false to print ₹0.
 * - decimals: fixed fraction digits (invoices use 2).
 * - short: ₹1.2L / ₹12k for chart ticks and tiles.
 */
export function formatMoney(
  minor: number,
  currency: Currency | string = "INR",
  opts: { compact?: boolean; zeroLabel?: string | false; decimals?: number; short?: boolean } = {},
): string {
  const upper = String(currency).toUpperCase();
  // A converted display currency: the amount is USD cents, shown in the
  // visitor's chosen currency at the reference rate (lib/currency).
  if (isConvertedCurrency(upper)) {
    const value = (minor / 100) * DISPLAY_RATES[upper];
    const fmt = (v: number, d: number) =>
      new Intl.NumberFormat("en", { style: "currency", currency: upper, maximumFractionDigits: d, minimumFractionDigits: 0 }).format(v);
    if (value === 0) return opts.zeroLabel === false ? fmt(0, 0) : (opts.zeroLabel ?? "Free");
    return fmt(value, value < 10 ? 2 : 0);
  }
  const cur: Currency = upper === "USD" ? "USD" : "INR";
  const value = minor / 100;
  if (value === 0 && opts.zeroLabel !== false) return opts.zeroLabel ?? "Free";

  if (opts.short && Math.abs(value) >= 1000) {
    if (cur === "INR") {
      return Math.abs(value) >= 100000
        ? `₹${(value / 100000).toFixed(Math.abs(value) >= 1000000 ? 1 : 0)}L`
        : `₹${(value / 1000).toFixed(Math.abs(value) >= 10000 ? 0 : 1)}k`;
    }
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
  }

  const digits = opts.decimals ?? (opts.compact || opts.short || Number.isInteger(value) ? 0 : 2);
  return new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: digits,
    minimumFractionDigits: opts.decimals ?? 0,
  }).format(value);
}

/** 12,34,567 (Indian grouping). */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-IN");
}

/** "INR 100/hr" - used in plan column headers. */
export function formatRate(
  minor: number,
  currency: Currency | PriceCurrency = "INR",
): string {
  return minor <= 0 ? formatMoney(0, currency) : `${formatMoney(minor, currency)}/hr`;
}

/** "INR 5,000 per hire", or a flat zero when there is no per-hire charge. */
export function formatPerHire(
  minor: number,
  currency: Currency = "INR",
): string {
  if (minor <= 0) return formatMoney(0, currency);
  return `${formatMoney(minor, currency)} per hire`;
}

export const formatCurrency = formatMoney;

/**
 * Three-letter months everywhere ("Sep", not en-IN's "Sept"; decided 28 Oct).
 * en-IN output has every other part we want; these two are the only places
 * that rule lives, so call sites use them rather than toLocale*String.
 */
export function shortDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString("en-IN", options).replace(/\bSept\b/g, "Sep");
}

/** As shortDate, for date and time together (toLocaleString). */
export function shortDateTime(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleString("en-IN", options).replace(/\bSept\b/g, "Sep");
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).replace(/\bSept\b/, "Sep");
}

/** Reading time at 200 wpm, rounded up, floored at 1. */
export function readingTimeMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

/**
 * Best-effort region detection.
 *
 * The legacy Pricing page inferred INR vs USD from
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`, `navigator.language`, and
 * a hardcoded `getTimeZoneOffset() === -330` check, inlined three times. This
 * is the same logic in one function, and it defaults to INR - the wrong
 * default for a majority-Indian product is a worse failure than showing
 * prices in a currency the visitor can still read.
 */
export function detectIsIndia(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (/Kolkata|Calcutta/i.test(tz)) return true;
    if (tz && !/Kolkata|Calcutta/i.test(tz)) return false;
    return /^en-IN/i.test(navigator.language ?? "");
  } catch {
    return true;
  }
}

/* ── Candidate facing dates ──────────────────────────────────────────────
 * The intern screens were rendering `new Date(x).toLocaleDateString()` with no
 * options at all, so times vanished entirely and interviews showed a timezone
 * where a date should have been. Interview times are agreed across people in
 * two countries, so the zone is part of the value, not a footnote: every
 * helper here takes the zone the row carried and prints it in that zone with
 * an abbreviation the reader can see. */

function zoneAbbrev(tz: string | null | undefined, date: Date): string {
  if (!tz) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** "Thu 9 Oct, 10:00 AM IST" */
export function formatSlotTime(value: Date | string | null, tz?: string | null): string {
  if (!value) return "Time to be confirmed";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Time to be confirmed";
  const core = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz || undefined,
  })
    .format(date)
    .replace(/\bSept\b/, "Sep");
  const abbrev = zoneAbbrev(tz, date);
  return abbrev ? `${core} ${abbrev}` : core;
}

/** Day only, no clock: "Thu 9 Oct" */
export function formatSlotDay(value: Date | string | null, tz?: string | null): string {
  if (!value) return "To be confirmed";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "To be confirmed";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz || undefined,
  })
    .format(date)
    .replace(/\bSept\b/, "Sep");
}

/**
 * "Today", "Yesterday", "3 days ago", then an absolute date.
 *
 * Relative wording only for the last week. Past that, an absolute date is more
 * useful and more honest than "47 days ago", which reads as neglect when it is
 * just a fact about a stipend.
 */
export function formatDayLabel(value: Date | string | null, now: Date = new Date()): string {
  if (!value) return "Unknown";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Unknown";
  // Future dates (a start date, a scheduled payout) count calendar days
  // ahead. This used to fall into the `days <= 0` branch, so every upcoming
  // start date read "Today".
  const ahead = calendarDaysBetween(now, date);
  if (ahead === 1) return "Tomorrow";
  if (ahead > 1 && ahead < 7) return `In ${ahead} days`;
  if (ahead >= 7) return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }).replace(/\bSept\b/, "Sep");
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }).replace(/\bSept\b/, "Sep");
}

/** DD/MM/YYYY in India time: the one numeric date format (bug sheet 7, NC r24; SPECS §5). */
export function formatDmy(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
}

/**
 * A joining date, always absolute ("24 Oct 2026") so it can be planned around,
 * with the relative hint while it is close: "24 Oct 2026 · in 5 days".
 */
export function formatJoiningDate(value: Date | string | null, now: Date = new Date()): string {
  if (!value) return "To be agreed";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "To be agreed";
  const absolute = formatDmy(date);
  const ahead = calendarDaysBetween(now, date);
  if (ahead === 0) return `${absolute} · today`;
  if (ahead === 1) return `${absolute} · tomorrow`;
  if (ahead > 1 && ahead < 7) return `${absolute} · in ${ahead} days`;
  return absolute;
}

/** Whole calendar days from `from` to `to` in India time (negative = past). */
function calendarDaysBetween(from: Date, to: Date): number {
  const day = (d: Date) =>
    Date.parse(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d)}T00:00:00Z`);
  return Math.round((day(to) - day(from)) / 86_400_000);
}

/** "September 2026" */
export function formatMonth(value: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** "1 Sep to 30 Sep 2026" without repeating a shared month. */
export function formatRange(start: Date | string | null, end: Date | string | null): string {
  if (!start) return "Dates to be confirmed";
  const a = typeof start === "string" ? new Date(start) : start;
  if (!end) return a.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }).replace(/\bSept\b/, "Sep");
  const b = typeof end === "string" ? new Date(end) : end;
  const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  const left = a.toLocaleDateString("en-IN", { day: "numeric", month: "short" }).replace(/\bSept\b/, "Sep");
  const right = sameMonth
    ? b.toLocaleDateString("en-IN", { day: "numeric", year: "numeric" })
    : b.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }).replace(/\bSept\b/, "Sep");
  return `${left} to ${right}`;
}

/** "1.2 MB" */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Two-letter initials for a company, for places that show who is hiring
 * without naming them (the open-roles list). "Northwind Labs" → "NL",
 * "Acme" → "AC", "IBM India Pvt Ltd" → "II". Legal suffixes are skipped so
 * "Zeta Pvt. Ltd." is "ZE", not "ZP".
 */
export function companyInitials(name: string | null | undefined): string {
  const all = String(name ?? "")
    .replace(/[^\p{L}\p{N}\s&-]/gu, " ")
    .split(/[\s&-]+/)
    .filter(Boolean);
  const meaningful = all.filter((w) => !/^(pvt|private|ltd|limited|llp|inc|llc|co|corp|the|and|of)$/i.test(w));
  const words = meaningful.length > 0 ? meaningful : all;
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

/* ── India time for interns ──────────────────────────────────────────────
 * Interns always read times in IST, labelled, whatever zone the company
 * booked in (bug sheet 7, S2 r7). Slots are stored as UTC instants that the
 * employer's wall time was converted from with `wallTimeToUtc` (DST-aware),
 * so showing them in India time is a plain re-format in Asia/Kolkata, which
 * has no DST of its own. Built from parts so the output does not depend on
 * the runtime's locale data ("pm" vs "PM", "Sept" vs "Sep"). */

export const IST_ZONE = "Asia/Kolkata";

function istParts(date: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: IST_ZONE,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const hour = Number(p.hour) % 24;
  const clock = `${hour % 12 || 12}:${p.minute} ${hour < 12 ? "AM" : "PM"}`;
  return { weekday: p.weekday, day: p.day, month: p.month, year: p.year, clock };
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Fri 10 Jul, 7:30 PM IST" (with `year`: "Fri 10 Jul 2026, 7:30 PM IST"). */
export function formatIst(value: Date | string | null | undefined, opts: { year?: boolean } = {}): string {
  const date = asDate(value);
  if (!date) return "Time to be confirmed";
  const p = istParts(date);
  return `${p.weekday} ${p.day} ${p.month}${opts.year ? ` ${p.year}` : ""}, ${p.clock} IST`;
}

/** Day only, in India: "Fri 10 Jul". */
export function formatIstDay(value: Date | string | null | undefined): string {
  const date = asDate(value);
  if (!date) return "To be confirmed";
  const p = istParts(date);
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** Clock only, in India and labelled: "7:30 PM IST". */
export function formatIstClock(value: Date | string | null | undefined): string {
  const date = asDate(value);
  if (!date) return "Time to be confirmed";
  return `${istParts(date).clock} IST`;
}
