/** Pure geometry for ScoreDial. Circles with stroke-dasharray; no React. */

export type DialAxes = {
  communication?: number | null;
  coding?: number | null;
  aptitude?: number | null;
  interview?: number | null;
};

export type DialSegment = {
  key: string;
  /** Degrees clockwise from 12 o'clock where this segment starts. */
  rotate: number;
  /** Arc length of the whole segment (the track). */
  length: number;
  /** Arc length of the filled part, 0..length. */
  fillLength: number;
  circumference: number;
  /** stroke-dasharray for the track circle. */
  trackDash: string;
  /** stroke-dasharray for the fill circle. */
  fillDash: string;
};

export const AXIS_ORDER = ["communication", "coding", "aptitude", "interview"] as const;

export function clamp10(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, n));
}

function build(key: string, rotate: number, sweepDeg: number, rating: number, r: number): DialSegment {
  const circumference = 2 * Math.PI * r;
  const length = (circumference * sweepDeg) / 360;
  const fillLength = (length * clamp10(rating)) / 10;
  return {
    key,
    rotate,
    length,
    fillLength,
    circumference,
    trackDash: `${length} ${circumference - length}`,
    fillDash: `${fillLength} ${circumference - fillLength}`,
  };
}

/** Four quarter arcs (Communication, Coding, Aptitude, Interview), clockwise from 12 o'clock, `gap` degrees apart. */
export function dialSegments({ axes, r, gap }: { axes: DialAxes; r: number; gap: number }): DialSegment[] {
  const g = Math.max(0, Math.min(40, gap));
  const sweep = 90 - g;
  return AXIS_ORDER.map((k, i) => build(k, i * 90 + g / 2, sweep, clamp10(axes[k]), r));
}

/** One full ring filled to score/10, starting at 12 o'clock. */
export function singleSegment({ score, r }: { score: number; r: number }): DialSegment {
  return build("score", 0, 360, clamp10(score), r);
}

export function meanOf(axes: DialAxes): number | null {
  const v = AXIS_ORDER.map((k) => axes[k]).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
