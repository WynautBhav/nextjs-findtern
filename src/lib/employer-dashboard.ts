/**
 * Pure data behind the employer dashboard: the hiring funnel, the weekly
 * activity columns, per-project progress and the "in 2 h 15 m" label.
 *
 * No database, no React, no `@/` imports (the node tests run this file
 * directly). The page loads rows, buckets proposals with `proposalBucket`, and
 * hands plain values in; every figure on screen comes out of these functions.
 */
import { todayIst, weekdayOf } from "./timesheet-days.ts";

/** Same union as `ProposalBucket` (components/employer/proposal-bucket.ts), inlined to keep this module import-free. */
export type DashBucket = "open" | "accepted" | "hired" | "closed";

export type DashProposal = {
  internId: string;
  projectId: string;
  /** Raw proposals.status. */
  status: string;
  /** `proposalBucket(status, lapsed)`; null for an unknown status. */
  bucket: DashBucket | null;
  createdAt: Date | string | null;
  hiredAt: Date | string | null;
};

/* ── Funnel ───────────────────────────────────────────────────────────── */

export type FunnelStageKey = "pipeline" | "offered" | "accepted" | "hired";

export type FunnelStage = {
  key: FunnelStageKey;
  label: string;
  /** Unique interns at this stage. Never above the previous stage's count. */
  count: number;
  /** Offered only: interns whose every offer was declined, withdrawn or expired (the hatched tail). 0 elsewhere. */
  lost: number;
  /** Share of the previous stage, rounded, 0..100. Null for the first stage and when the previous stage is 0 (draw "—"). */
  conversionPct: number | null;
  /** Wording for the conversion: "of in pipeline", "of offered", "of accepted". Null for the first stage. */
  conversionOf: string | null;
  /** What is waiting at this stage, ready to print ("6 awaiting a reply"); null when nothing is. */
  sub: string | null;
  /** Proposals tab the bar links to; null for the pipeline stage (the shortlist). */
  href: string;
};

export type Funnel = {
  stages: FunnelStage[];
  /** False when the pipeline is empty: draw the empty state, not four zero bars. */
  hasData: boolean;
};

export type FunnelInput = {
  proposals: DashProposal[];
  /** Intern ids on the shortlist or checkout (employer_cart_items, cart and checkout lists). */
  shortlistInternIds: string[];
  /** Intern ids with a scheduled or completed interview. */
  metInternIds: string[];
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : null);

/**
 * Four stages per unique intern, nested by construction: each set is built
 * from the previous one, so Hired <= Accepted <= Offered <= In pipeline.
 */
export function buildFunnel({ proposals, shortlistInternIds, metInternIds }: FunnelInput): Funnel {
  type Flags = { anyProposal: boolean; offered: boolean; accepted: boolean; hired: boolean; live: boolean; awaiting: boolean; toPay: boolean };
  const byIntern = new Map<string, Flags>();
  for (const p of proposals) {
    const f = byIntern.get(p.internId) ?? { anyProposal: false, offered: false, accepted: false, hired: false, live: false, awaiting: false, toPay: false };
    f.anyProposal = true;
    if (p.status !== "draft") f.offered = true;
    if (p.bucket === "accepted" || p.bucket === "hired") f.accepted = true;
    if (p.bucket === "hired") f.hired = true;
    if (p.bucket === "open" || p.bucket === "accepted" || p.bucket === "hired") f.live = true;
    if (p.bucket === "open" && p.status !== "draft") f.awaiting = true;
    if (p.status === "accepted" || p.status === "processing") f.toPay = true;
    byIntern.set(p.internId, f);
  }

  const offered = new Set<string>();
  const accepted = new Set<string>();
  const hired = new Set<string>();
  let lost = 0;
  let awaiting = 0;
  let toPay = 0;
  for (const [id, f] of byIntern) {
    if (f.offered) {
      offered.add(id);
      if (!f.live) lost += 1;
      if (f.awaiting) awaiting += 1;
      // Accepted and hired are built from offered, so the nesting cannot break.
      if (f.accepted) {
        accepted.add(id);
        if (f.toPay) toPay += 1;
        if (f.hired) hired.add(id);
      }
    }
  }

  const pipeline = new Set<string>([...shortlistInternIds, ...metInternIds, ...byIntern.keys()]);
  // On the shortlist or met, but with no live proposal (a declined one puts them back in play): what is waiting on the employer.
  let unproposed = 0;
  for (const id of new Set([...shortlistInternIds, ...metInternIds])) if (!byIntern.get(id)?.live) unproposed += 1;

  const stage = (key: FunnelStageKey, label: string, set: Set<string>, prev: Set<string> | null, prevName: string | null, extra: Partial<FunnelStage>): FunnelStage => ({
    key,
    label,
    count: set.size,
    lost: 0,
    conversionPct: prev ? pct(set.size, prev.size) : null,
    conversionOf: prevName ? `of ${prevName}` : null,
    sub: null,
    href: "/employer/proposals",
    ...extra,
  });

  return {
    hasData: pipeline.size > 0,
    stages: [
      stage("pipeline", "In pipeline", pipeline, null, null, {
        sub: unproposed ? `${plural(unproposed, "candidate", "candidates")} waiting for an offer` : null,
        href: "/employer/cart",
      }),
      stage("offered", "Offered", offered, pipeline, "in pipeline", {
        lost,
        sub: awaiting ? `${awaiting} awaiting a reply` : null,
        href: "/employer/proposals?status=open",
      }),
      stage("accepted", "Accepted", accepted, offered, "offered", {
        sub: toPay ? `${toPay} to pay` : null,
        href: "/employer/proposals?status=accepted",
      }),
      stage("hired", "Hired", hired, accepted, "accepted", {
        href: "/employer/proposals?status=hired",
      }),
    ],
  };
}

/* ── Weekly activity ──────────────────────────────────────────────────── */

export type ActivityWeek = {
  /** Monday of the week, `YYYY-MM-DD` (IST). */
  start: string;
  /** "9 Nov" style label of the Monday, for the axis. */
  label: string;
  /** Proposals sent that week (drafts excluded). */
  sent: number;
  hires: number;
  /** The week containing today (IST). */
  current: boolean;
};

export type Activity = {
  /** Oldest first, always `WEEKS` entries, the last one is the current week. */
  weeks: ActivityWeek[];
  totalSent: number;
  totalHires: number;
  /** Weeks with a sent proposal or a hire. Under 2: draw the fallback (figure plus tick row). */
  activeWeeks: number;
};

export const ACTIVITY_WEEKS = 8;

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday on or before `iso`. */
export function mondayOf(iso: string): string {
  return addDays(iso, -((weekdayOf(iso) + 6) % 7));
}

function dayLabel(iso: string): string {
  // Fixed names: ICU spells September "Sept" in some locales.
  return `${Number(iso.slice(8, 10))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(iso.slice(5, 7)) - 1]}`;
}

/** Eight Monday-start IST weeks ending with the current one. */
export function buildActivity(proposals: Pick<DashProposal, "status" | "createdAt" | "hiredAt">[], now: Date = new Date()): Activity {
  const thisMonday = mondayOf(todayIst(now));
  const weeks: ActivityWeek[] = Array.from({ length: ACTIVITY_WEEKS }, (_, i) => {
    const start = addDays(thisMonday, -7 * (ACTIVITY_WEEKS - 1 - i));
    return { start, label: dayLabel(start), sent: 0, hires: 0, current: i === ACTIVITY_WEEKS - 1 };
  });
  const index = new Map(weeks.map((w) => [w.start, w]));
  const weekOf = (at: Date | string | null) => {
    if (!at) return null;
    const d = at instanceof Date ? at : new Date(at);
    if (Number.isNaN(d.getTime())) return null;
    return index.get(mondayOf(todayIst(d))) ?? null;
  };
  for (const p of proposals) {
    if (p.status !== "draft") {
      const w = weekOf(p.createdAt);
      if (w) w.sent += 1;
    }
    const h = weekOf(p.hiredAt);
    if (h) h.hires += 1;
  }
  return {
    weeks,
    totalSent: weeks.reduce((s, w) => s + w.sent, 0),
    totalHires: weeks.reduce((s, w) => s + w.hires, 0),
    activeWeeks: weeks.filter((w) => w.sent > 0 || w.hires > 0).length,
  };
}

/* ── Per project ──────────────────────────────────────────────────────── */

export type ProjectProgressStats = {
  hired: number;
  /** Offers still in play: awaiting a reply or accepted. */
  open: number;
  /** Declined, withdrawn or expired. */
  declined: number;
  /** Accepted offers waiting on payment. */
  toPay: number;
};

export function buildProjectStats(proposals: Pick<DashProposal, "projectId" | "status" | "bucket">[]): Map<string, ProjectProgressStats> {
  const out = new Map<string, ProjectProgressStats>();
  for (const p of proposals) {
    const row = out.get(p.projectId) ?? { hired: 0, open: 0, declined: 0, toPay: 0 };
    if (p.bucket === "hired") row.hired += 1;
    if (p.bucket === "open" || p.bucket === "accepted") row.open += 1;
    if (p.bucket === "closed") row.declined += 1;
    if (p.status === "accepted" || p.status === "processing") row.toPay += 1;
    out.set(p.projectId, row);
  }
  return out;
}

/* ── Next meeting ─────────────────────────────────────────────────────── */

/** "in 2 h 15 m", "in 45 m", "in 3 d", "starting now". Static: computed on the server, no ticker. */
export function untilLabel(at: Date, now: Date = new Date()): string {
  const mins = Math.round((at.getTime() - now.getTime()) / 60000);
  if (mins <= 0) return "starting now";
  if (mins < 60) return `in ${mins} m`;
  if (mins < 24 * 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `in ${h} h ${m} m` : `in ${h} h`;
  }
  return `in ${Math.floor(mins / (24 * 60))} d`;
}
