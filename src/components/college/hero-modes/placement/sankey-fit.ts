const per = (total: number, avail: number) => (total ? avail / total : 0);

/** Tallest label a node holds (name and count in one row): a smaller non-zero node is drawn this tall so its text never spills. */
export const MIN_NODE = 26;

/**
 * Heights for one column sharing `avail`: proportional, except a non-zero value too small to hold its label gets
 * MIN_NODE and the others share what is left. `scale` is what the proportional ones used.
 */
export function fitColumn(values: number[], avail: number): { heights: number[]; scale: number } {
  let small = new Set<number>();
  for (;;) {
    const bigSum = values.reduce((a, v, i) => (small.has(i) ? a : a + v), 0);
    const scale = per(bigSum, Math.max(0, avail - small.size * MIN_NODE));
    const next = new Set(values.flatMap((v, i) => (v > 0 && (small.has(i) || v * scale < MIN_NODE) ? [i] : [])));
    if (next.size === small.size) return { heights: values.map((v, i) => (small.has(i) ? MIN_NODE : v * scale)), scale };
    small = next;
  }
}
