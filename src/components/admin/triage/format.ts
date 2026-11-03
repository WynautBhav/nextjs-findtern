/**
 * Pure helpers for the Triage dashboard (the desk, the money strip, the
 * finding sentence). No React, so the server page and the client desk share
 * one copy and the sentences can be tested.
 */

import { formatMoney, shortDateTime } from "../../../lib/format.ts";
import type { MoneyStuck, QueueKey } from "@/lib/admin/dashboard-queues.types";

/** Whole rupees from paise; a real zero prints "₹0". */
export const rupees = (minor: number) => formatMoney(Math.round(minor), "INR", { decimals: 0, zeroLabel: false });

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The filter row's short names: the full labels are sentences. */
export const FILTER_LABEL: Record<QueueKey, string> = {
  calendar: "Calendar",
  payouts: "Payouts",
  nolink: "Links",
  unscored: "Scores",
  messages: "Messages",
  accepted: "Offers",
  sheets: "Timesheets",
};

/**
 * Tone steps of the brand green for the owed bar, brightest first (rank
 * order). Percentages of `--color-brand-700` mixed into the panel ground, so
 * each step is a flat colour and never a transparency over its neighbour.
 */
export const BAR_STEPS = [100, 82, 66, 53, 42, 33, 26] as const;

/** The calendar flag is the one warm hue on the page. */
export const BAR_FLAG = "var(--color-accent-700)";

export function barColor(step: number, flag: boolean): string {
  if (flag) return BAR_FLAG;
  const pct = BAR_STEPS[Math.min(step, BAR_STEPS.length - 1)];
  return `color-mix(in srgb, var(--color-brand-700) ${pct}%, var(--admin-panel))`;
}

/**
 * The finding under the title: what is stuck, on whom, and how much. Counts
 * only when an amount is missing or zero; one plain sentence when empty.
 */
export function findingSentence(money: MoneyStuck, total: number, fresh: number): string {
  if (total <= 0) return "Nothing is waiting on the team.";
  const parts: string[] = [];
  const offers = money.employerOfferCount;
  const payouts = money.payoutCount;
  if (offers > 0) {
    parts.push(
      money.owedByEmployersMinor > 0
        ? `${rupees(money.owedByEmployersMinor)} is waiting on employers across ${offers} accepted ${plural(offers, "offer", "offers")}`
        : `${offers} accepted ${plural(offers, "offer is", "offers are")} waiting on employers`,
    );
  }
  if (payouts > 0) {
    parts.push(
      money.dueToInternsMinor > 0
        ? `${rupees(money.dueToInternsMinor)} is due to interns across ${payouts} stipend ${plural(payouts, "payout", "payouts")}`
        : `${payouts} stipend ${plural(payouts, "payout is", "payouts are")} due to interns`,
    );
  }
  const lead = parts.length ? `${parts.join(" and ")}.` : `${total} ${plural(total, "item needs", "items need")} you.`;
  const fresh7 = Math.max(0, Math.min(fresh, total));
  return fresh7 > 0 ? `${lead} ${fresh7} of the ${total} ${plural(total, "item is", "items are")} new this week.` : lead;
}

/** "in 2 h", "in 3 d", "overdue 6 d": the distance from `nowMs` to an instant. */
export function timeLabel(whenIso: string, nowMs: number): string | null {
  const t = new Date(whenIso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = t - nowMs;
  const minutes = Math.abs(diff) / 60_000;
  const hours = minutes / 60;
  const days = hours / 24;
  if (diff >= 0) {
    if (hours < 1) return `in ${Math.max(1, Math.round(minutes))} min`;
    if (hours < 48) return `in ${Math.round(hours)} h`;
    return `in ${Math.round(days)} d`;
  }
  if (hours < 1) return "due now";
  if (hours < 24) return `overdue ${Math.round(hours)} h`;
  return `overdue ${Math.floor(days)} d`;
}

/** "today" or "3 d": whole days since the item became actionable. */
export function ageLabel(ageDays: number | null): string | null {
  if (ageDays == null || !Number.isFinite(ageDays)) return null;
  return ageDays <= 0 ? "today" : `${Math.round(ageDays)} d`;
}

/** "5 Nov, 15:30" in India time. */
export function slotLabel(whenIso: string): string | null {
  const d = new Date(whenIso);
  if (Number.isNaN(d.getTime())) return null;
  return shortDateTime(d, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** "5 min ago", "2 h ago", "29 d ago": how long ago an instant was. */
export function agoLabel(whenIso: string, nowMs: number): string | null {
  const t = new Date(whenIso).getTime();
  if (Number.isNaN(t)) return null;
  const minutes = Math.max(0, nowMs - t) / 60_000;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** Queues whose `when` is a deadline or a slot: only these read as "in 2 h" or "overdue 6 d". */
const DEADLINE_QUEUES: ReadonlySet<QueueKey> = new Set<QueueKey>(["payouts", "nolink"]);

/**
 * The two figures on a row's right edge: the key number, and a muted line under it.
 * A message that arrived 2 h ago or an offer accepted 29 d ago is not "overdue": only a
 * payout's due date and an interview slot are deadlines; the rest say how long they have waited.
 */
export function rowFigures(
  r: { queue: QueueKey; amountMinorInr: number | null; ageDays: number | null; when: string | null },
  nowMs: number,
): { main: string | null; sub: string | null } {
  const deadline = DEADLINE_QUEUES.has(r.queue);
  const distance = deadline && r.when ? timeLabel(r.when, nowMs) : null;
  const waited = !deadline
    ? r.ageDays != null && Number.isFinite(r.ageDays) && r.ageDays >= 1
      ? `waiting ${Math.round(r.ageDays)} d`
      : r.when
        ? agoLabel(r.when, nowMs)
        : ageLabel(r.ageDays)
    : null;
  const age = deadline ? ageLabel(r.ageDays) : waited;
  if (r.amountMinorInr != null) return { main: rupees(r.amountMinorInr), sub: distance ?? age };
  return { main: distance ?? age, sub: r.when && distance ? slotLabel(r.when) : r.when && !deadline ? slotLabel(r.when) : null };
}

/** The pastel chip tone for a row's muted figure: a missed date is red, a near one amber, a slot ahead blue, the rest neutral. */
export function figureTone(label: string | null | undefined): "danger" | "warning" | "info" | "neutral" {
  const v = (label ?? "").toLowerCase();
  if (v.startsWith("overdue")) return "danger";
  if (v.startsWith("due now") || v.startsWith("waiting")) return "warning";
  if (v.startsWith("in ")) return "info";
  return "neutral";
}
