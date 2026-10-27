/**
 * Pure helpers behind the admin dashboard, kept out of the page so they can
 * be unit tested.
 */

/** The hero number: everything a person owes someone, and what is new. */
export function attentionTotal(tasks: { count: number; fresh?: number }[]): { total: number; fresh: number } {
  let total = 0;
  let fresh = 0;
  for (const t of tasks) {
    total += Math.max(0, t.count);
    fresh += Math.max(0, Math.min(t.fresh ?? 0, t.count));
  }
  return { total, fresh };
}

export type FunnelStage = {
  label: string;
  /** Candidates who reached at least this step. */
  reached: number;
  /** Whole-number % of the step above that reached this one; null for the first step or an empty step above. */
  rate: number | null;
};

/**
 * Turns "furthest step reached" counts (1-based stage → candidates) into a
 * monotone funnel: a candidate hired without a recorded shortlist still
 * counts as shortlisted, so a step can never exceed the one above it.
 */
export function funnelSteps(labels: string[], rows: { stage: number; value: number }[]): FunnelStage[] {
  const furthest = new Array<number>(labels.length).fill(0);
  for (const r of rows) {
    const i = Math.trunc(r.stage) - 1;
    if (i >= 0 && i < labels.length && Number.isFinite(r.value)) furthest[i] += Math.max(0, r.value);
  }
  const reached = labels.map((_, i) => furthest.slice(i).reduce((a, b) => a + b, 0));
  return labels.map((label, i) => ({
    label,
    reached: reached[i],
    rate: i === 0 || reached[i - 1] === 0 ? null : Math.round((reached[i] / reached[i - 1]) * 100),
  }));
}
