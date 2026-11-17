import { AI_EXPIRY_REASONS, type AiExpiryReason, type ExpiredAiRow } from "../ai-interview-expiry.ts";
import { expiredCounts, headlineCount, type ExpiredRow } from "../tracker.ts";
import { istDayKey } from "../revenue.ts";
import type { ExpiryReason } from "../../proposal-expiry.ts";

/**
 * The Overview tab's Expiries section: how many offers and AI interviews expired in the selected period, by reason.
 * Pure. The rows come from the same functions as the tracker's and the AI page's Expired tabs (tracker.expiredProposals,
 * ai-interview-expiry.expiredAiRows), so a count here and the list its link opens cannot disagree.
 * A row counts when its expiry time is in [since, until); until null = now. A row with no known time is not counted
 * in a window (it is still in the list for all time).
 */

type Window = { since: Date | null; until: Date | null };

const inWindow = (at: Date | null, w: Window) => at !== null && (!w.since || at >= w.since) && (!w.until || at < w.until);

export type Expiries = {
  proposals: Record<ExpiryReason, number>;
  /** The "Expired" headline: the three reasons where the offer lapsed or was lost; withdrawn and admin-closed are separate. */
  proposalsHeadline: number;
  ai: Record<AiExpiryReason, number>;
  aiTotal: number;
};

export function expiriesInWindow(rows: { proposals: Pick<ExpiredRow, "reason" | "at">[]; ai: Pick<ExpiredAiRow, "reason" | "at">[] }, w: Window): Expiries {
  const proposals = expiredCounts(rows.proposals.filter((r) => inWindow(r.at, w)) as { reason: ExpiryReason }[]);
  const ai = Object.fromEntries(AI_EXPIRY_REASONS.map((r) => [r, 0])) as Record<AiExpiryReason, number>;
  for (const r of rows.ai) if (inWindow(r.at, w)) ai[r.reason] += 1;
  return { proposals, proposalsHeadline: headlineCount(proposals), ai, aiTotal: AI_EXPIRY_REASONS.reduce((n, r) => n + ai[r], 0) };
}

/** Links to the two Expired tabs, pre-filtered to the window as IST days of the expiry (`to` is the last whole day inside it). */
export function expiryLinks(w: Window): { proposals: (reason: ExpiryReason | null) => string; ai: (reason: AiExpiryReason | null) => string } {
  const range = new URLSearchParams();
  if (w.since) range.set("from", istDayKey(w.since)!);
  if (w.until) range.set("to", istDayKey(new Date(w.until.getTime() - 1))!);
  const href = (path: string, base: Record<string, string>, reason: string | null) => {
    const q = new URLSearchParams(base);
    if (reason) q.set("reason", reason);
    for (const [k, v] of range) q.set(k, v);
    return `${path}?${q.toString()}`;
  };
  return {
    proposals: (reason) => href("/admin/proposal-tracker", { tab: "expired" }, reason),
    ai: (reason) => href("/admin/ai-interviews", { filter: "expired" }, reason),
  };
}

