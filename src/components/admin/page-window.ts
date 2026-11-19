/** Builds the page list: 1 … 4 5 [6] 7 8 … 88 */
export function pageWindow(current: number, total: number, span = 1): (number | "gap")[] {
  if (total <= 1) return [1];

  const pages = new Set<number>([1, total, current]);
  for (let offset = 1; offset <= span; offset += 1) {
    if (current - offset > 1) pages.add(current - offset);
    if (current + offset < total) pages.add(current + offset);
  }

  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const page of sorted) {
    // A gap that hides exactly one page is no saving: show the page instead.
    if (previous && page - previous === 2) out.push(previous + 1);
    else if (previous && page - previous > 2) out.push("gap");
    out.push(page);
    previous = page;
  }
  return out;
}
