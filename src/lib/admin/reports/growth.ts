/** Period-over-period change and zero-filled series for the Reports tabs. Pure. */

export type Growth = { pct: number | null; kind: "up" | "down" | "flat" | "new" | "none"; label: string };

const MINUS = "\u2212";

/**
 * Change from `prev` to `cur`. `prev === null` means there is nothing to compare with (all time).
 * A zero baseline with a positive figure is "New": a percentage of zero is meaningless.
 */
export function growth(cur: number, prev: number | null): Growth {
  if (prev === null || !Number.isFinite(cur) || !Number.isFinite(prev)) return { pct: null, kind: "none", label: "" };
  if (prev === 0) return cur > 0 ? { pct: null, kind: "new", label: "New" } : { pct: 0, kind: "flat", label: "0%" };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { pct: 0, kind: "flat", label: "0%" };
  return { pct, kind: pct > 0 ? "up" : "down", label: `${pct > 0 ? "+" : MINUS}${Math.abs(pct)}%` };
}

/** What `<StatStrip>` wants for a delta chip. */
export function statDelta(cur: number, prev: number | null): { delta?: string; trend?: "up" | "down" | "flat" } {
  const g = growth(cur, prev);
  if (g.kind === "none") return {};
  return { delta: g.label, trend: g.kind === "new" ? "up" : g.kind };
}

/** One value per bucket key, zero where no row fell in the bucket; rows with a key outside `keys` are dropped. */
export function fillSeries<T extends { key: string }>(keys: string[], rows: readonly T[], value: (r: T) => number): number[] {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.key, (by.get(r.key) ?? 0) + value(r));
  return keys.map((k) => by.get(k) ?? 0);
}
