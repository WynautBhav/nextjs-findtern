/**
 * Heat: one shared scale for "how urgently does an admin need to act on this row". Each pipeline (proposals,
 * meetings, payouts) has its own pure scorer and its own written explanation (HeatGuide), but they all return this
 * shape and use these levels, so "Hot" means the same thing on every screen.
 *
 * Score 0-100. Level: hot >= 70, warm >= 40, calm below. Closed rows (nothing left to do) are `null`, never "calm".
 * `why` is one short plain line naming the facts that set the score ("Starts in 2 days · no meeting link").
 */
export type HeatLevel = "hot" | "warm" | "calm";
export type Heat = { score: number; level: HeatLevel; why: string };

export const HOT_AT = 70;
export const WARM_AT = 40;
export const HEAT_LABEL: Record<HeatLevel, string> = { hot: "Hot", warm: "Warm", calm: "Calm" };

export const levelOf = (score: number): HeatLevel => (score >= HOT_AT ? "hot" : score >= WARM_AT ? "warm" : "calm");

/** Clamp to 0-100, round, and attach the level and the why line. */
export function heatOf(score: number, why: string[]): Heat {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return { score: s, level: levelOf(s), why: why.filter(Boolean).join(" · ") };
}

/** Sort key: hottest first, closed rows (null) last. */
export const heatSortKey = (h: Heat | null): number => (h ? h.score : -1);

/** The written rules a page shows under "What heat means". Every factor names its points so the score can be checked by hand. */
export type HeatGuide = {
  /** One sentence: what heat measures on this page. */
  measures: string;
  /** The facts that add points, in the order they matter. */
  factors: { label: string; points: string }[];
  /** Rows that never get a heat (closed, nothing to do). */
  noHeat: string;
  /** Optional: what an admin should do with a hot row. */
  action?: string;
};
