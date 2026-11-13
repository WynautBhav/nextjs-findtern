/**
 * Who leads a comparison row. Pure and import-free so it runs under plain `node --test`.
 *
 * Rules, the same for every row:
 * - A value of 0 (or less, or NaN) means "not scored / not rated": it neither leads nor counts as someone to beat.
 * - At least two candidates need a real value, else there is nothing to compare.
 * - Values are compared as shown (one decimal), so 7.04 and 7.0 are level.
 * - Ties at the top all lead (everyone shown the same best value gets the mark),
 *   unless every candidate is level: then nobody is marked.
 * - `lowerIsBetter` is for prices.
 */
export function leaders(values: number[], opts: { lowerIsBetter?: boolean } = {}): Set<number> {
  const key = (v: number) => Math.round(v * 10);
  const rated = values.map((v, i) => ({ k: key(v), i })).filter((x) => Number.isFinite(x.k) && x.k > 0);
  if (rated.length < 2) return new Set();
  const best = opts.lowerIsBetter ? Math.min(...rated.map((x) => x.k)) : Math.max(...rated.map((x) => x.k));
  const top = rated.filter((x) => x.k === best);
  return top.length === rated.length ? new Set() : new Set(top.map((x) => x.i));
}

/**
 * True when two or more candidates have a real value and all of them are level.
 * Such a row has no leader; the matrix says "All level" instead of leaving the gap unexplained.
 */
export function isLevel(values: number[]): boolean {
  const rated = values.map((v) => Math.round(v * 10)).filter((k) => Number.isFinite(k) && k > 0);
  return rated.length >= 2 && rated.every((k) => k === rated[0]);
}
