/**
 * Pure data shaping for the admin Reports pages: previous-period windows,
 * deltas, funnel steps and monthly money flows. No DB, no React.
 */

const MINUS = "\u2212";

export type Window = { since: Date | null; until: Date | null };

/**
 * The window of equal length that ends where `w` starts, for "vs previous
 * period". Null when there is no start (all time) so no delta is invented.
 * An open end means "now".
 */
export function previousWindow(w: Window, now: Date = new Date()): Window | null {
  if (!w.since) return null;
  const end = w.until ?? now;
  const len = end.getTime() - w.since.getTime();
  if (!(len > 0)) return null;
  return { since: new Date(w.since.getTime() - len), until: w.since };
}

/** Percent change from `prev` to `cur`, rounded; null when there is no base to compare with. */
export function percentChange(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/** "+12%" / "\u22123%" / "0%" with a real minus sign; empty when null. */
export function formatPercentDelta(pct: number | null): string {
  if (pct === null) return "";
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : MINUS}${Math.abs(pct)}%`;
}

export type FunnelRow = {
  label: string;
  count: number;
  /** Share of the first step, 0-100 (0 when the first step is empty). */
  ofFirst: number;
  /** Share of the step above, 0-100; null for the first step or an empty step above. */
  ofPrevious: number | null;
  /** People lost since the step above (never negative); 0 for the first step. */
  lost: number;
  /** True for the step with the largest loss (first on ties; none when nothing is lost). */
  biggestDrop: boolean;
};

export function funnelRows(steps: { label: string; count: number }[]): FunnelRow[] {
  const first = steps[0]?.count ?? 0;
  const rows = steps.map((s, i): FunnelRow => {
    const prev = i === 0 ? null : steps[i - 1].count;
    return {
      label: s.label,
      count: s.count,
      ofFirst: first > 0 ? Math.round((s.count / first) * 100) : 0,
      ofPrevious: prev !== null && prev > 0 ? Math.round((s.count / prev) * 100) : null,
      lost: prev === null ? 0 : Math.max(0, prev - s.count),
      biggestDrop: false,
    };
  });
  let at = -1;
  rows.forEach((r, i) => {
    if (r.lost > 0 && (at < 0 || r.lost > rows[at].lost)) at = i;
  });
  if (at >= 0) rows[at].biggestDrop = true;
  return rows;
}

export type FlowRow = { date: string; status: string; inrMinor: number };
export type FlowPoint = { key: string; label: string; inMinor: number; outMinor: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 26" for a `YYYY-MM` key. */
export function monthLabel(key: string): string {
  const m = Number(key.slice(5, 7));
  return `${MONTHS[m - 1] ?? key} ${key.slice(2, 4)}`;
}

/**
 * Money actually moved per month: `received` receivables in, `paid` payables
 * out (rows still due, upcoming, pending or unpaid are not cash). Months run
 * unbroken from the first to the last month with cash, so the line has no
 * gaps; at most the last `max` months are kept.
 */
export function monthlyFlows(receivables: FlowRow[], payables: FlowRow[], max = 24): FlowPoint[] {
  const inBy = new Map<string, number>();
  const outBy = new Map<string, number>();
  const add = (m: Map<string, number>, r: FlowRow) => {
    const k = r.date.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(k)) m.set(k, (m.get(k) ?? 0) + r.inrMinor);
  };
  for (const r of receivables) if (r.status === "received") add(inBy, r);
  for (const r of payables) if (r.status === "paid") add(outBy, r);
  const keys = [...inBy.keys(), ...outBy.keys()].sort();
  if (keys.length === 0) return [];
  const [last] = keys.slice(-1);
  let y = Number(keys[0].slice(0, 4));
  let m = Number(keys[0].slice(5, 7));
  const out: FlowPoint[] = [];
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ key, label: monthLabel(key), inMinor: inBy.get(key) ?? 0, outMinor: outBy.get(key) ?? 0 });
    if (key >= last) break;
    if (++m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.slice(-max);
}

/** Period key as the page URLs carry it, for the selector. */
export type PeriodChoice = { value: string; label: string };
export function activePeriod(params: { period?: string; from?: string; to?: string }, fallback: string): string {
  if (params.from || params.to) return "custom";
  return params.period && params.period !== "" ? params.period : fallback;
}
