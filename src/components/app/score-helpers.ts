import { bandFor, PLAN_NAME } from "../../lib/score.ts";

/** "8.8 · Assured" (band word from BANDS). */
export function scoreLabel(score: number): string {
  const s = Math.max(0, Math.min(10, score));
  return `${s.toFixed(1)} · ${bandFor(s).name}`;
}

/** "Findtern score 8.8 out of 10, Assured band". */
export function scoreA11y(score: number): string {
  const s = Math.max(0, Math.min(10, score));
  return `Findtern score ${s.toFixed(1)} out of 10, ${bandFor(s).name} band`;
}

export { bandFor, PLAN_NAME };

/** Number and band word apart, for layouts that set the number larger. */
export function scoreParts(score: number): { value: string; band: string } {
  const s = Math.max(0, Math.min(10, score));
  return { value: s.toFixed(1), band: bandFor(s).name };
}
