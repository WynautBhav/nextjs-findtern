import type { MasterRow } from "./master-row.ts";

/**
 * The score cut-offs Master data's ready-made views use ("Strong score, no offer", "Score beats CGPA" and so on),
 * stated in the screen's words so the officer knows the cut.
 */
export const STRONG_SCORE = 7;
export const HIGH_CGPA = 7.5;

export type Quadrant = "stars" | "scoreBeatsCg" | "cgBeatsScore" | "support";

export function quadrantOf(r: Pick<MasterRow, "cgpa" | "score">): Quadrant | null {
  if (r.cgpa === null || r.score === null) return null;
  const strong = r.score >= STRONG_SCORE;
  const high = r.cgpa >= HIGH_CGPA;
  return strong && high ? "stars" : strong ? "scoreBeatsCg" : high ? "cgBeatsScore" : "support";
}
