/**
 * When an AI interview reads as expired on the admin side. Pure: no DB, no React.
 *
 * Expired means one of:
 *  - `link_expired`: a link went out and the interview is still not completed N days later
 *    (`ai_link_expiry_days`, default 7). At exactly N x 24 h it counts as expired.
 *  - `missed` / `cancelled` / `no_show`: the interview is closed without being taken, at once and
 *    with or without a link.
 * A completed interview is never expired, however old. Waiting for a link (none sent) is not expiry.
 *
 * "Link sent at" has no column of its own. The meeting-link route writes an `interview.ai_link_added`
 * audit row (once per new or changed link) and bumps `interviews.updated_at`, so the loader resolves it
 * as: the latest audit row for the interview, else `updated_at`, else `created_at` (linkSentAtOf).
 * `updated_at` is a proxy: any later edit to the row moves it, so it can only make an old link look newer.
 */

import { filterAiLinkRows } from "./ai-link-queue.ts";
import { parseIstDay } from "./tracker.ts";

export type AiExpiryReason = "link_expired" | "missed" | "cancelled" | "no_show";
export type AiTab = "waiting" | "sent" | "completed" | "expired";

type When = Date | string | null | undefined;

export type AiExpiryInput = {
  status: string | null;
  meetingLink: string | null;
  /** When the current link was sent (see linkSentAtOf). */
  linkSentAt: When;
  /** The row's last update: when a closed interview was closed. */
  updatedAt: When;
};

export const DEFAULT_AI_LINK_EXPIRY_DAYS = 7;
const DAY_MS = 86_400_000;

const CLOSED: Record<string, AiExpiryReason> = { missed: "missed", cancelled: "cancelled", canceled: "cancelled", no_show: "no_show" };

function toDate(v: When): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The time the link went out: the audit row, else updated_at, else created_at; null when none is known. */
export function linkSentAtOf(p: { auditAt: When; updatedAt: When; createdAt: When }): Date | null {
  return toDate(p.auditAt) ?? toDate(p.updatedAt) ?? toDate(p.createdAt);
}

export const AI_EXPIRY_REASONS: AiExpiryReason[] = ["link_expired", "missed", "cancelled", "no_show"];

export function aiExpiryLabel(reason: AiExpiryReason, days: number): string {
  switch (reason) {
    case "link_expired":
      return `Link expired: not completed in ${days} ${days === 1 ? "day" : "days"}`;
    case "missed":
      return "Missed";
    case "cancelled":
      return "Cancelled";
    case "no_show":
      return "No-show";
  }
}

const normDays = (d: number) => (Number.isFinite(d) && d >= 1 ? Math.floor(d) : DEFAULT_AI_LINK_EXPIRY_DAYS);

export function aiInterviewExpired(
  r: AiExpiryInput,
  now: Date,
  expiryDays: number,
): { expired: boolean; reason: AiExpiryReason | null; at: Date | null } {
  const none = { expired: false, reason: null, at: null } as const;
  const status = String(r.status ?? "").toLowerCase();
  if (status === "completed") return { ...none };

  const sent = toDate(r.linkSentAt);
  const closed = CLOSED[status];
  if (closed) return { expired: true, reason: closed, at: toDate(r.updatedAt) ?? sent };

  if (String(r.meetingLink ?? "").trim() && sent) {
    const at = new Date(sent.getTime() + normDays(expiryDays) * DAY_MS);
    if (now.getTime() >= at.getTime()) return { expired: true, reason: "link_expired", at };
  }
  return { ...none };
}

/** Whole days from `from` to `now`, never negative; null when `from` is unknown. */
export function daysSince(from: When, now: Date): number | null {
  const d = toDate(from);
  return d ? Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY_MS)) : null;
}

/** The one tab a row belongs to: an expired row is never also "sent" or "waiting". */
export function aiTabOf(r: AiExpiryInput, now: Date, expiryDays: number): AiTab {
  if (String(r.status ?? "").toLowerCase() === "completed") return "completed";
  if (aiInterviewExpired(r, now, expiryDays).expired) return "expired";
  return String(r.meetingLink ?? "").trim() ? "sent" : "waiting";
}

export type ExpiredAiRow<T extends AiExpiryInput = AiExpiryInput> = T & { reason: AiExpiryReason; at: Date | null };

/** The rows that read as expired, with why and when. */
export function expiredAiRows<T extends AiExpiryInput>(rows: T[], now: Date, expiryDays: number): ExpiredAiRow<T>[] {
  const out: ExpiredAiRow<T>[] = [];
  for (const r of rows) {
    const e = aiInterviewExpired(r, now, expiryDays);
    if (e.expired && e.reason) out.push({ ...r, reason: e.reason, at: e.at });
  }
  return out;
}

export type ExpiredAiFilters = { reason: string; q: string; since: Date | null; until: Date | null };

/** The AI Expired tab's and the CSV's filters from one URL bag (`from`/`to` are IST days of the expiry; to is the whole day). */
export function parseExpiredAiFilters(params: Record<string, string | undefined>): ExpiredAiFilters {
  const to = parseIstDay(params.to, true);
  return {
    reason: (AI_EXPIRY_REASONS as string[]).includes(params.reason ?? "") ? (params.reason as string) : "",
    q: (params.q ?? "").trim(),
    since: parseIstDay(params.from),
    until: to ? new Date(to.getTime() + 1) : null,
  };
}

/** Reason, name/email/phone search, and the expiry range (since inclusive, until exclusive; a row with no known time never matches a range). */
export function filterExpiredAi<T extends ExpiredAiRow & { name: string; email: string; phone: string }>(rows: T[], f: ExpiredAiFilters): T[] {
  return filterAiLinkRows(rows, f.q).filter(
    (r) => (!f.reason || r.reason === f.reason) && ((!f.since && !f.until) || (r.at !== null && (!f.since || r.at >= f.since) && (!f.until || r.at < f.until))),
  );
}

export function expiredAiCounts(rows: { reason: AiExpiryReason }[]): Record<AiExpiryReason, number> {
  const out = Object.fromEntries(AI_EXPIRY_REASONS.map((r) => [r, 0])) as Record<AiExpiryReason, number>;
  for (const r of rows) out[r.reason] += 1;
  return out;
}
