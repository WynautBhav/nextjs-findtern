/** Pure helpers for the dashboard cards (kept import-free so node tests can load them). */

/** Six pale tints (bg + text, all AA), picked by hashing the id so neighbours differ and a person keeps theirs. */
export const TINTS = [
  "bg-brand-100 text-brand-800",
  "bg-accent-100 text-accent-700",
  "bg-info-soft text-info",
  "bg-success-soft text-success",
  "bg-danger-soft text-danger",
  "bg-ink-100 text-ink-700",
] as const;

export function tintFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

/** Most segments drawn for skill fit; a longer skill list is capped, never invented. */
export const MAX_SEGMENTS = 24;

/**
 * Skill-fit segments: one per skill asked for, `filled` of them lit. 16 px wide
 * with a 2 px gap up to 8 (so 5 skills is 88 px); past 8 they share 142 px.
 */
export function fitSegments(hit: number, of: number): { n: number; filled: number; width: number } {
  const n = Math.max(0, Math.min(Math.trunc(of) || 0, MAX_SEGMENTS));
  const filled = Math.max(0, Math.min(Math.trunc(hit) || 0, n));
  return { n, filled, width: Math.min(n, 8) * 18 - 2 };
}

/** Length of the lit arc of a ring of radius `r` for a score out of 10 (clamped). */
export function ringArc(score: number, r: number): { arc: number; circumference: number } {
  const value = Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
  const circumference = 2 * Math.PI * r;
  return { arc: (value / 10) * circumference, circumference };
}
