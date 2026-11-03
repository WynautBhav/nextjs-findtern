/**
 * Pure geometry for the hand-drawn admin charts (Gauge, LineDuo, PillBars).
 * No DOM, no React: everything here is unit tested in chart-geometry.test.ts.
 */

export type Pt = { x: number; y: number };

const round = (n: number) => Math.round(n * 100) / 100;

/** A finite, non-negative number; anything else counts as zero. */
export function safeValue(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ── Gauge ─────────────────────────────────────────────────────────────── */

/**
 * A point on a half-donut. Fraction 0 is the left end of the baseline, 0.5 the
 * top, 1 the right end. y grows downwards (SVG), so the arc bulges up.
 */
export function gaugePoint(cx: number, cy: number, r: number, fraction: number): Pt {
  const a = Math.PI * fraction;
  return { x: round(cx - r * Math.cos(a)), y: round(cy - r * Math.sin(a)) };
}

/** SVG arc path along a half-donut from `start` to `end` (fractions 0..1). */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const s = Math.min(1, Math.max(0, start));
  const e = Math.min(1, Math.max(s, end));
  const p0 = gaugePoint(cx, cy, r, s);
  const p1 = gaugePoint(cx, cy, r, e);
  // A half-donut never spans more than 180 degrees, so large-arc is always 0;
  // sweep 1 runs clockwise on screen, left to right over the top.
  return `M${p0.x},${p0.y} A${r},${r} 0 0 1 ${p1.x},${p1.y}`;
}

/**
 * Turns segment values into fractions that sum to exactly 1. Negative,
 * non-finite and zero values count as 0. When the total is 0 every fraction is
 * 0 (the caller draws an empty hatched track).
 */
export function segmentFractions(values: number[]): number[] {
  const clean = values.map(safeValue);
  const total = clean.reduce((a, b) => a + b, 0);
  if (total === 0) return clean.map(() => 0);
  const fractions = clean.map((v) => v / total);
  // Float dust: pin the last non-zero segment so the sum is exactly 1.
  let last = -1;
  fractions.forEach((f, i) => {
    if (f > 0) last = i;
  });
  const others = fractions.reduce((a, f, i) => (i === last ? a : a + f), 0);
  fractions[last] = 1 - others;
  return fractions;
}

export type GaugeArc = { start: number; end: number } | null;

/**
 * Start/end fractions for each segment, with a `pad` gap trimmed from every
 * edge that touches a neighbour (the outer ends stay flush). A zero segment
 * is `null`. A segment thinner than its gaps collapses to a dot.
 */
export function gaugeArcs(fractions: number[], pad: number): GaugeArc[] {
  const nonZero = fractions.map((f) => f > 0);
  let cursor = 0;
  return fractions.map((f, i) => {
    const start = cursor;
    const end = cursor + f;
    cursor = end;
    if (!nonZero[i]) return null;
    const hasPrev = nonZero.slice(0, i).some(Boolean);
    const hasNext = nonZero.slice(i + 1).some(Boolean);
    let a = start + (hasPrev ? pad : 0);
    let b = end - (hasNext ? pad : 0);
    if (b <= a) {
      const mid = (start + end) / 2;
      a = mid;
      b = mid + 0.0005;
    }
    return { start: a, end: b };
  });
}

/* ── Ticks and label thinning ──────────────────────────────────────────── */

/**
 * Round tick values from 0 up to a nice ceiling of `max`, aiming for `count`
 * intervals (so about count + 1 ticks). Steps are 1, 2, 2.5, 5 times 10^n.
 */
export function niceTicks(max: number, count = 4): number[] {
  const intervals = Math.max(1, Math.floor(count));
  const top = Number.isFinite(max) && max > 0 ? max : 1;
  const raw = top / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
  const n = Math.ceil(top / step - 1e-9);
  const ticks: number[] = [];
  for (let i = 0; i <= n; i++) ticks.push(Math.round(i * step * 1e6) / 1e6);
  return ticks;
}

/**
 * Indices of x labels to keep so that no two overlap: every `step`-th one,
 * where a label needs `labelPx` of the `slotPx` its point owns.
 */
export function thinLabelIndices(count: number, slotPx: number, labelPx: number): number[] {
  if (count <= 0) return [];
  const step = slotPx > 0 ? Math.max(1, Math.ceil(labelPx / slotPx)) : count;
  const out: number[] = [];
  for (let i = 0; i < count; i += step) out.push(i);
  return out;
}

/* ── Smooth line ───────────────────────────────────────────────────────── */

export type CubicSegment = { c1: Pt; c2: Pt; to: Pt };

/**
 * Monotone-x cubic Bezier through every point (Fritsch-Carlson, the same
 * curve d3's curveMonotoneX draws). Points must be sorted by x. The curve
 * passes through each point and never overshoots between two of them.
 */
export function monotoneSegments(points: Pt[]): CubicSegment[] {
  const n = points.length;
  if (n < 2) return [];
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const w = points[i + 1].x - points[i].x;
    dx.push(w);
    slope.push(w === 0 ? 0 : (points[i + 1].y - points[i].y) / w);
  }
  const tangent: number[] = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }
  const segments: CubicSegment[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const w = dx[i] / 3;
    segments.push({
      c1: { x: p0.x + w, y: p0.y + w * tangent[i] },
      c2: { x: p1.x - w, y: p1.y - w * tangent[i + 1] },
      to: p1,
    });
  }
  return segments;
}

/** SVG path for `monotoneSegments`; a single point is a bare move. */
export function monotonePath(points: Pt[]): string {
  if (points.length === 0) return "";
  const start = `M${round(points[0].x)},${round(points[0].y)}`;
  return monotoneSegments(points).reduce(
    (d, s) =>
      `${d} C${round(s.c1.x)},${round(s.c1.y)} ${round(s.c2.x)},${round(s.c2.y)} ${round(s.to.x)},${round(s.to.y)}`,
    start,
  );
}

/** Index of the value in `xs` closest to `x`; -1 for an empty list. */
export function nearestIndex(xs: number[], x: number): number {
  let best = -1;
  let bestDist = Infinity;
  xs.forEach((v, i) => {
    const d = Math.abs(v - x);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}
