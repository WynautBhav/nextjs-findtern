import { cgpaSla, type CgpaSlaTone } from "../cgpa-verification-flow.ts";
import type { CgpaStatus } from "../cgpa-verification.ts";

/** Pure rules for the admin CGPA verification queue (loader: cgpa-queue-load.ts). */

export type CgpaQueueProposal = {
  id: string;
  company: string;
  project: string;
  /** Day the internship starts, YYYY-MM-DD (India date), or null. */
  startDate: string | null;
  /** accepted (waiting on payment), processing or hired. */
  status: string;
  acceptedAt: string | null;
};

export type CgpaQueueProof = { key: string; label: string; docKey: string };

export type CgpaQueueRow = {
  internId: string;
  name: string;
  email: string;
  phone: string;
  college: string;
  /** "B.Tech · year 3" style line. */
  course: string;
  status: Exclude<CgpaStatus, "not_required">;
  semester: number | null;
  claimedScore: string;
  scoreType: "cgpa" | "percentage" | "";
  correctedScore: string | null;
  requestedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  note: string | null;
  proofs: CgpaQueueProof[];
  proposals: CgpaQueueProposal[];
};

export type CgpaFilter = "pending" | "overdue" | "verified" | "incorrect";
export const CGPA_FILTERS: { key: CgpaFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "overdue", label: "Overdue" },
  { key: "verified", label: "Verified" },
  { key: "incorrect", label: "Incorrect" },
];

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** When the clock started for this intern: the earliest acceptance across their offers, or null if none yet. */
export function firstAcceptedAt(proposals: Pick<CgpaQueueProposal, "acceptedAt">[]): string | null {
  const times = proposals.map((p) => (p.acceptedAt ? Date.parse(p.acceptedAt) : NaN)).filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

/** The SLA of a row: only a pending check has a clock. */
export function rowSla(row: Pick<CgpaQueueRow, "status" | "proposals">, now: Date): { tone: CgpaSlaTone; label: string } {
  if (row.status !== "pending") return { tone: "none", label: "" };
  const { tone, label } = cgpaSla(firstAcceptedAt(row.proposals), now);
  return { tone, label };
}

export function isOverdue(row: Pick<CgpaQueueRow, "status" | "proposals">, now: Date): boolean {
  return rowSla(row, now).tone === "overdue";
}

export function matchesFilter(row: Pick<CgpaQueueRow, "status" | "proposals">, filter: CgpaFilter, now: Date): boolean {
  if (filter === "overdue") return isOverdue(row, now);
  return row.status === filter;
}

export function countsByFilter(rows: Pick<CgpaQueueRow, "status" | "proposals">[], now: Date): Record<CgpaFilter, number> {
  const out: Record<CgpaFilter, number> = { pending: 0, overdue: 0, verified: 0, incorrect: 0 };
  for (const r of rows) {
    if (r.status === "pending") out.pending++;
    if (isOverdue(r, now)) out.overdue++;
    if (r.status === "verified") out.verified++;
    if (r.status === "incorrect") out.incorrect++;
  }
  return out;
}

const digitsOf = (v: string) => v.replace(/\D/g, "");

/** Every word has to match the name, email, college or company (case-insensitive), or the phone on digits. */
export function searchRows<T extends Pick<CgpaQueueRow, "name" | "email" | "phone" | "college" | "proposals">>(rows: T[], q: string | null | undefined): T[] {
  const words = String(q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => {
    const text = `${r.name} ${r.email} ${r.college} ${r.proposals.map((p) => p.company).join(" ")}`.toLowerCase();
    const phone = digitsOf(r.phone);
    return words.every((w) => text.includes(w) || (digitsOf(w).length > 0 && phone.includes(digitsOf(w))));
  });
}

/**
 * Pending: overdue first (oldest acceptance first), then the soonest to be overdue, then candidates with no accepted
 * offer yet (oldest request first). Decided checks: newest decision first.
 */
export function sortRows<T extends CgpaQueueRow>(rows: T[], filter: CgpaFilter, now: Date): T[] {
  const t = (v: string | null) => (v ? Date.parse(v) || 0 : 0);
  if (filter === "verified" || filter === "incorrect") return [...rows].sort((a, b) => t(b.decidedAt) - t(a.decidedAt));
  return [...rows].sort((a, b) => {
    const fa = firstAcceptedAt(a.proposals);
    const fb = firstAcceptedAt(b.proposals);
    if (fa && fb) return t(fa) - t(fb);
    if (fa) return -1;
    if (fb) return 1;
    return t(a.requestedAt) - t(b.requestedAt);
  });
}

/** The start day (IST midnight) of an offer as an instant. */
function startInstant(day: string): number {
  return Date.parse(`${day.slice(0, 10)}T00:00:00+05:30`);
}

/**
 * Whether the internship starts in under 48 hours (amber), or its start day has already come (red); the proposal is
 * unpaid or being paid, so the clock matters. Null when there is no start date or it is further away.
 */
export function startWarning(startDate: string | null, now: Date): { tone: "soon" | "past"; label: string } | null {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}/.test(startDate)) return null;
  const left = startInstant(startDate) - now.getTime();
  if (!Number.isFinite(left)) return null;
  if (left < 0) return { tone: "past", label: "Start date passed" };
  if (left >= 2 * DAY_MS) return null;
  const hours = Math.max(1, Math.ceil(left / HOUR_MS));
  return { tone: "soon", label: `Starts in ${hours} h` };
}
