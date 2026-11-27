import type { MasterRow } from "./master-row.ts";

/**
 * The score cut-offs Master data's ready-made views use ("Strong score, no offer", "Score beats CGPA" and so on),
 * stated in the screen's words so the officer knows the cut.
 */
export const STRONG_SCORE = 7;
export const HIGH_CGPA = 7.5;

export type Quadrant = "stars" | "scoreBeatsCg" | "cgBeatsScore" | "support";

export const QUADRANTS: readonly Quadrant[] = ["scoreBeatsCg", "stars", "support", "cgBeatsScore"];

/** The Master data ready-made view that lists each quadrant (master-data-table.tsx PRESETS). */
export const QUADRANT_VIEW: Record<Quadrant, string> = { scoreBeatsCg: "score-beats-cg", stars: "stars", support: "support", cgBeatsScore: "cg-beats-score" };

export function quadrantOf(r: Pick<MasterRow, "cgpa" | "score">): Quadrant | null {
  if (r.cgpa === null || r.score === null) return null;
  const strong = r.score >= STRONG_SCORE;
  const high = r.cgpa >= HIGH_CGPA;
  return strong && high ? "stars" : strong ? "scoreBeatsCg" : high ? "cgBeatsScore" : "support";
}

/** The one rule for "is this student in that quadrant": the Dashboard tile, its list and Master data's filter all call it. */
export function inQuadrant(r: Pick<MasterRow, "cgpa" | "score">, q: Quadrant): boolean {
  return quadrantOf(r) === q;
}

/** Students per quadrant. Rows with no score or no CGPA are in none. */
export function quadrantCounts(rows: Pick<MasterRow, "cgpa" | "score">[]): Record<Quadrant, number> {
  const out: Record<Quadrant, number> = { stars: 0, scoreBeatsCg: 0, cgBeatsScore: 0, support: 0 };
  for (const r of rows) {
    const q = quadrantOf(r);
    if (q) out[q]++;
  }
  return out;
}

/**
 * The list under a quadrant tile: highest score first, cut at `cap`. `total` is the tile's count and `more` is what the cut hides,
 * so the screen can say "See all N" instead of leaving the officer to wonder where the rest went.
 */
export function quadrantList<T extends { score: number | null; cgpa: number | null }>(rows: T[], q: Quadrant, cap: number): { shown: T[]; total: number; more: number } {
  const all = rows.filter((r) => inQuadrant(r, q)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.cgpa ?? 0) - (a.cgpa ?? 0));
  return { shown: all.slice(0, cap), total: all.length, more: Math.max(0, all.length - cap) };
}
