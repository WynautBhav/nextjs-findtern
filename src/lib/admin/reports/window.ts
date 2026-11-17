/**
 * The one period model for the admin Reports tabs. Pure: no DB, no React.
 *
 * Days, weeks and months are India (Asia/Kolkata, UTC+5:30, no DST) calendar
 * units, like the rest of the money layer (lib/admin/revenue). A week starts
 * on MONDAY, which is also what Postgres `date_trunc('week', ...)` does, so a
 * bucket computed here and one computed in SQL always agree.
 *
 * URL: `?tab=interns&range=week` (today | week | month | all). The older
 * `period=30d` presets and a custom `from`/`to` still work and win over
 * `range`, so every link the old Reports, Analytics and Money pages made keeps
 * its meaning.
 */
import { istDateRange, istDayKey, istDayKeys, istDayStart } from "../revenue.ts";

export const REPORT_TABS = ["overview", "interns", "employers", "finance"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];
export const TAB_LABELS: Record<ReportTab, string> = { overview: "Overview", interns: "Interns", employers: "Employers", finance: "Finance" };

export type RangeKind = "today" | "week" | "month" | "preset" | "custom" | "all";
export type BucketUnit = "day" | "week" | "month";

export type ReportWindow = {
  tab: ReportTab;
  kind: RangeKind;
  /** Inclusive start (null = since the beginning). */
  since: Date | null;
  /** Exclusive end (null = now). */
  until: Date | null;
  /** The comparison window, same shape; null when there is nothing to compare with (all time). */
  prevSince: Date | null;
  prevUntil: Date | null;
  /** Short human name: "Today", "This week", "Last 30 days", "1 Nov to 10 Nov"... */
  label: string;
  /** The value of `range` / `period` to put in a link for this window. */
  param: { range?: string; period?: string };
};

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of the India day -> its Monday (the India week start), as a day key. */
function mondayOf(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return new Date(d.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
}

/** First day of the month containing a day key. */
const monthFirst = (dayKey: string) => `${dayKey.slice(0, 7)}-01`;

/** The instant the India bucket of this unit containing `at` begins. */
export function bucketStart(at: Date, unit: BucketUnit): Date {
  const day = istDayKey(at)!;
  return istDayStart(unit === "day" ? day : unit === "week" ? mondayOf(day) : monthFirst(day));
}

/** Day key (`YYYY-MM-DD`) of the first day of the India day / week / month containing `at`. */
export function bucketKeyOf(at: Date, unit: BucketUnit): string {
  const day = istDayKey(at)!;
  return unit === "day" ? day : unit === "week" ? mondayOf(day) : monthFirst(day);
}

/** Next bucket's start key after `key`. */
function nextKey(key: string, unit: BucketUnit): string {
  const d = new Date(`${key}T00:00:00Z`);
  if (unit === "day") return new Date(d.getTime() + DAY_MS).toISOString().slice(0, 10);
  if (unit === "week") return new Date(d.getTime() + 7 * DAY_MS).toISOString().slice(0, 10);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

/** Every bucket key from the one containing `since` to the one containing `end`, oldest first, no gaps. */
export function bucketKeys(since: Date, end: Date, unit: BucketUnit): string[] {
  const last = bucketKeyOf(end, unit);
  const keys: string[] = [];
  for (let k = bucketKeyOf(since, unit); k <= last && keys.length < 400; k = nextKey(k, unit)) keys.push(k);
  return keys;
}

function prevKey(key: string, unit: BucketUnit): string {
  const d = new Date(`${key}T00:00:00Z`);
  if (unit === "day") return new Date(d.getTime() - DAY_MS).toISOString().slice(0, 10);
  if (unit === "week") return new Date(d.getTime() - 7 * DAY_MS).toISOString().slice(0, 10);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

function prevMonthStart(since: Date): Date {
  const first = istDayKey(since)!; // 1st of this month
  const y = Number(first.slice(0, 4));
  const m = Number(first.slice(5, 7));
  return istDayStart(new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10));
}

const shortDay = (key: string) => {
  const [, m, d] = key.split("-");
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(d)} ${MON[Number(m) - 1]}`;
};

const PRESET_LABEL: Record<string, string> = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 3 months", "180d": "Last 6 months", "365d": "Last 12 months" };

export function parseReportWindow(params: Record<string, string | undefined>, now: Date = new Date()): ReportWindow {
  const tab = (REPORT_TABS as readonly string[]).includes(params.tab ?? "") ? (params.tab as ReportTab) : "overview";
  const custom = istDateRange(params.from, params.to);
  const base = { tab, until: null as Date | null };

  if (custom.since || custom.until) {
    const span = custom.since && (custom.until ?? now) > custom.since ? (custom.until ?? now).getTime() - custom.since.getTime() : null;
    const fromKey = custom.since ? shortDay(istDayKey(custom.since)!) : "the start";
    const toKey = custom.until ? shortDay(istDayKey(new Date(custom.until.getTime() - 1))!) : "today";
    return {
      ...base,
      kind: "custom",
      since: custom.since,
      until: custom.until,
      prevSince: custom.since && span ? new Date(custom.since.getTime() - span) : null,
      prevUntil: custom.since && span ? custom.since : null,
      label: `${fromKey} to ${toKey}`,
      param: {},
    };
  }

  // `30d` = today and the 29 India days before it (calendar-aligned, so the trend has whole buckets).
  const presetDays = /^(\d{1,3})d$/.exec(params.period ?? "");
  const preset = presetDays && Number(presetDays[1]) > 0 ? istDayStart(istDayKeys(now, Number(presetDays[1]))[0]) : null;
  if (preset) {
    const span = now.getTime() - preset.getTime();
    return { ...base, kind: "preset", since: preset, prevSince: new Date(preset.getTime() - span), prevUntil: preset, label: PRESET_LABEL[params.period ?? ""] ?? "Selected period", param: { period: params.period } };
  }

  const range = params.range === "today" || params.range === "week" || params.range === "month" || params.range === "all" ? params.range : "month";
  if (range === "all") return { ...base, kind: "all", since: null, prevSince: null, prevUntil: null, label: "All time", param: { range: "all" } };

  const since = bucketStart(now, range === "today" ? "day" : range);
  const elapsed = now.getTime() - since.getTime();
  const prevSince =
    range === "today" ? new Date(since.getTime() - DAY_MS) : range === "week" ? new Date(since.getTime() - 7 * DAY_MS) : prevMonthStart(since);
  // Same elapsed time into the previous period, never running into the current one.
  const prevUntil = new Date(Math.min(prevSince.getTime() + elapsed, since.getTime()));
  return {
    ...base,
    kind: range,
    since,
    prevSince,
    prevUntil,
    label: range === "today" ? "Today" : range === "week" ? "This week" : "This month",
    param: { range },
  };
}

export type TrendSpec = { bucket: BucketUnit; keys: string[]; since: Date };

/** Fixed-length trend that ends now: 14 days for Today, 8 weeks for Week, 6 months for Month; other windows pick the bucket from their span (at most 24 buckets). */
export function trendSpec(w: ReportWindow, now: Date = new Date()): TrendSpec {
  const fixed = (bucket: BucketUnit, n: number): TrendSpec => {
    const keys = [bucketKeyOf(now, bucket)];
    while (keys.length < n) keys.unshift(prevKey(keys[0], bucket));
    return { bucket, keys, since: istDayStart(keys[0]) };
  };
  if (w.kind === "today") return fixed("day", 14);
  if (w.kind === "week") return fixed("week", 8);
  if (w.kind === "month") return fixed("month", 6);
  const end = w.until ? new Date(w.until.getTime() - 1) : now;
  const since = w.since ?? new Date(end.getTime() - 365 * DAY_MS);
  const days = Math.max(1, Math.ceil((end.getTime() - since.getTime()) / DAY_MS));
  const bucket: BucketUnit = days <= 45 ? "day" : days <= 200 ? "week" : "month";
  const keys = bucketKeys(since, end, bucket).slice(-24);
  return { bucket, keys, since: istDayStart(keys[0]) };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Short axis label for a bucket key: day "17 Nov", week "16 Nov" (the Monday), month "Nov 26". */
export function bucketLabel(key: string, unit: BucketUnit): string {
  const [y, m, d] = key.split("-");
  return unit === "month" ? `${MON[Number(m) - 1]} ${y.slice(2)}` : `${Number(d)} ${MON[Number(m) - 1]}`;
}

/**
 * The { since, until } an export route should use. A link made by a Reports tab carries `tab` and/or `range`
 * and means that tab's window; an older link (no `tab`, no `range`) keeps its legacy reading, passed in as `legacy`.
 */
export function exportRange(
  params: Record<string, string | undefined>,
  legacy: (p: Record<string, string | undefined>) => { since: Date | null; until: Date | null },
  now: Date = new Date(),
): { since: Date | null; until: Date | null } {
  if (!params.tab && !params.range) return legacy(params);
  const w = parseReportWindow(params, now);
  return { since: w.since, until: w.until };
}
