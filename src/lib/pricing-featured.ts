/**
 * "Most popular" is a single choice per currency set. Rows written by older
 * code, the seed, or two concurrent saves can leave several flagged; these pure
 * helpers pick the one that stands, so every reader and the writer agree.
 * No imports, so `node --test` covers it without a database.
 */

export type FeaturedRow = { id: string; isFeatured: boolean; updatedAt?: Date | string | null };

function instant(v: Date | string | null | undefined): number {
  if (v == null) return Number.NEGATIVE_INFINITY;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/**
 * The plan that keeps the flag: the most recently updated of the flagged rows
 * (a row with no update time is the oldest; a tie keeps the earlier row, i.e. sort
 * order). Null when none is flagged.
 */
export function pickFeaturedWinner(rows: readonly FeaturedRow[]): string | null {
  let best: FeaturedRow | null = null;
  for (const r of rows) {
    if (!r.isFeatured) continue;
    if (best === null || instant(r.updatedAt) > instant(best.updatedAt)) best = r;
  }
  return best ? best.id : null;
}

/** Ids of the flagged rows that must be un-flagged. `preferId` (when flagged) wins over recency. */
export function featuredLosers(rows: readonly FeaturedRow[], preferId?: string): string[] {
  const preferred = preferId !== undefined && rows.some((r) => r.id === preferId && r.isFeatured);
  const winner = preferred ? preferId : pickFeaturedWinner(rows);
  return rows.filter((r) => r.isFeatured && r.id !== winner).map((r) => r.id);
}

/** Every row, the flag kept only on the winner. Input is not mutated. */
export function singleFeatured<T extends FeaturedRow>(rows: readonly T[]): T[] {
  const winner = pickFeaturedWinner(rows);
  return rows.map((r) => (r.isFeatured && r.id !== winner ? { ...r, isFeatured: false } : r));
}
