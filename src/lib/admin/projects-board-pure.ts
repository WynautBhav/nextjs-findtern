/**
 * Admin Projects board: the status badge, the Activate / Deactivate switch, the view counts and the pay summary of a
 * project. Pure, so the page, the client rows and the tests share one definition. SQL twins live in projects-board.ts.
 */

import { INR_PER_USD } from "../currency.ts";
import { internStipendInrMinor, parseOffer } from "../offer.ts";
import { isOpenProject, normalizeStatus } from "../projects/lifecycle.ts";
import type { StatusTone } from "./status-tone.ts";

/** projects.location_type in words. */
export const MODE_LABEL: Readonly<Record<string, string>> = { remote: "Remote", onsite: "On-site", hybrid: "Hybrid" };

export type ProjectStatusKey = "active" | "deactivated" | "paused" | "closed" | "draft" | "pending_review" | "rejected";

export interface ProjectStatusInput {
  status: string | null | undefined;
  takenDownAt: Date | string | null | undefined;
}

const LIFECYCLE: Record<Exclude<ProjectStatusKey, "active" | "deactivated">, { label: string; tone: StatusTone; why: string }> = {
  paused: { label: "Paused", tone: "warning", why: "Paused by the employer" },
  closed: { label: "Closed", tone: "neutral", why: "Closed by the employer" },
  draft: { label: "Draft", tone: "neutral", why: "Still a draft with the employer" },
  pending_review: { label: "Pending review", tone: "info", why: "Not yet published by the employer" },
  rejected: { label: "Rejected", tone: "danger", why: "Rejected; the employer must resubmit" },
};

/** The employer's own status in canonical words; a blank status is a live (published) one, as isOpenProject reads it. */
function lifecycleOf(status: string | null | undefined) {
  return normalizeStatus((status ?? "").trim().toLowerCase() || "published");
}

/**
 * One badge per project. Active is isOpenProject; Deactivated is a Findtern takedown (whatever the employer's status);
 * anything else is the employer's lifecycle status in plain words. An unknown status reads as Closed.
 */
export function projectStatus(p: ProjectStatusInput): { key: ProjectStatusKey; label: string; tone: StatusTone } {
  if (isOpenProject(p)) return { key: "active", label: "Active", tone: "success" };
  if (p.takenDownAt) return { key: "deactivated", label: "Deactivated", tone: "danger" };
  const s = lifecycleOf(p.status);
  const key = s && s !== "published" ? s : "closed";
  return { key, label: LIFECYCLE[key].label, tone: LIFECYCLE[key].tone };
}

export type ActiveToggle =
  | { show: false }
  | { show: true; on: boolean; action: "deactivate" | "activate" }
  | { show: true; on: false; action: null; reason: string };

/**
 * The row's Activate / Deactivate switch. Deactivate is the takedown, Activate the restore; a project the employer
 * paused, closed, left in draft or had rejected is off and locked, since only the employer can reopen it.
 */
export function activeToggle(p: ProjectStatusInput, canWrite: boolean): ActiveToggle {
  if (!canWrite) return { show: false };
  if (isOpenProject(p)) return { show: true, on: true, action: "deactivate" };
  if (p.takenDownAt) return { show: true, on: false, action: "activate" };
  const key = projectStatus(p).key as keyof typeof LIFECYCLE;
  return { show: true, on: false, action: null, reason: LIFECYCLE[key]?.why ?? LIFECYCLE.closed.why };
}

/** After a restore the project is open again only if the employer's own status is live. */
export function restoresToActive(status: string | null | undefined): boolean {
  return lifecycleOf(status) === "published";
}

/**
 * Every Findtern project is an internship. projects.fullTimeOffer is the employer's answer to "Full-time role after the
 * internship" (the employer project form), not the engagement: the row, the CSV and the filter show it as that answer.
 */
export function engagementOf(p: { fullTimeOffer: boolean | null | undefined }): { engagement: "Internship"; ftAfterInternship: "Yes" | "No" } {
  return { engagement: "Internship", ftAfterInternship: p.fullTimeOffer === true ? "Yes" : "No" };
}

export type ProjectView = "all" | "active" | "deactivated" | "full_time";
export const PROJECT_VIEWS: readonly ProjectView[] = ["all", "active", "deactivated", "full_time"];

export interface ViewRow extends ProjectStatusInput {
  fullTimeOffer: boolean | null | undefined;
}

/** Pure twin of VIEW_SQL in projects-board.ts: which projects each view tab lists. */
export function matchesView(p: ViewRow, view: ProjectView): boolean {
  if (view === "active") return isOpenProject(p);
  if (view === "deactivated") return Boolean(p.takenDownAt);
  if (view === "full_time") return p.fullTimeOffer === true;
  return true;
}

/** Each view's count is the length of the list that view shows. */
export function viewCounts(rows: readonly ViewRow[]): Record<ProjectView, number> {
  return Object.fromEntries(PROJECT_VIEWS.map((v) => [v, rows.filter((r) => matchesView(r, v)).length])) as Record<ProjectView, number>;
}

export interface OfferRow {
  status: string;
  currency: string | null;
  offerDetails: unknown;
}

export interface PaySummary {
  offers: number;
  /** Intern stipend a month, INR minor. */
  stipend: { min: number; max: number } | null;
  months: { min: number; max: number } | null;
  /** Annual CTC, INR minor (USD converted at the reference rate). */
  ctc: { min: number; max: number } | null;
}

const widen = (r: { min: number; max: number } | null, v: number) => (r ? { min: Math.min(r.min, v), max: Math.max(r.max, v) } : { min: v, max: v });

/** Pay and length across the offers sent on a project (drafts are not sent). Full-time offers give CTC, the rest a stipend. */
export function paySummary(offers: readonly OfferRow[]): PaySummary {
  const out: PaySummary = { offers: 0, stipend: null, months: null, ctc: null };
  for (const row of offers) {
    if (row.status.trim().toLowerCase() === "draft") continue;
    out.offers += 1;
    const o = parseOffer(row.offerDetails, row.currency);
    if (o.fullTime) {
      const ctc = o.fullTime.annualCtcMinor;
      if (ctc != null && ctc > 0) out.ctc = widen(out.ctc, o.currency === "USD" ? ctc * INR_PER_USD : ctc);
      continue;
    }
    const stipend = internStipendInrMinor(o, o.candidateScore);
    if (stipend != null) out.stipend = widen(out.stipend, stipend);
    if (o.months > 0) out.months = widen(out.months, o.months);
  }
  return out;
}

const inr = (minor: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(minor / 100);
const lakh = (minor: number) => `₹${Math.round((minor / 100 / 100000) * 10) / 10}L`;
const span = (r: { min: number; max: number }, f: (n: number) => string) => (r.min === r.max ? f(r.min) : `${f(r.min)}–${f(r.max)}`);

/** Labelled lines for the row: "Stipend ₹8,000–₹15,000 a month · 3–6 months", "CTC ₹6.5L a year". Empty when no offer was sent. */
export function payLines(s: PaySummary): string[] {
  if (s.offers === 0) return [];
  const lines: string[] = [];
  const months = s.months ? `${span(s.months, String)} ${s.months.max === 1 ? "month" : "months"}` : null;
  const stipend = s.stipend ? (s.stipend.max === 0 ? "Unpaid" : `Stipend ${span(s.stipend, inr)} a month`) : null;
  if (stipend || months) lines.push([stipend, months].filter(Boolean).join(" · "));
  if (s.ctc) lines.push(`CTC ${span(s.ctc, lakh)} a year`);
  return lines;
}
