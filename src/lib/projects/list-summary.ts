/**
 * Pure helpers for the employer Projects list: the status strip, the skill chips, the proposals bar and the
 * page count. No imports, so they run under `node --test` as they are.
 */

/** Count projects by status key; a project with no known status is counted under "unknown". */
export function tallyStatuses(keys: ReadonlyArray<string | null | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) {
    const key = k ?? "unknown";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

export type StripTile = { key: string; label: string; count: number; hint: string };

/**
 * The status strip, which is also the filter. "All" and the four everyday states are always there (a zero is
 * information: "nothing paused"); the review and rejected states appear only when a project is in them.
 * Same states and order as the old tab row, plus the always-on zeros the old figure strip showed.
 */
export function stripTiles(
  counts: Record<string, number>,
  total: number,
  meta: Record<string, string>,
): StripTile[] {
  const hints: Record<string, string> = {
    published: "Candidates can see these",
    draft: "Not yet published",
    pending_review: "Not shown to candidates yet",
    paused: "Hidden until you resume",
    rejected: "Edit and publish again",
    closed: "No longer open to candidates",
  };
  const always = new Set(["published", "draft", "paused", "closed"]);
  const order = ["published", "draft", "pending_review", "paused", "rejected", "closed"];
  const tiles: StripTile[] = [{ key: "all", label: "All", count: total, hint: "Every project" }];
  for (const key of order) {
    const count = counts[key] ?? 0;
    if (count > 0 || always.has(key)) tiles.push({ key, label: meta[key] ?? key, count, hint: hints[key] ?? "" });
  }
  return tiles;
}

/** The first `max` skills as chips and how many are left over for the "+N" chip. */
export function skillChips(skills: readonly string[], max = 5): { shown: string[]; more: number } {
  const shown = skills.slice(0, Math.max(0, max));
  return { shown, more: skills.length - shown.length };
}

/** Accepted share of sent, 0-100, whole number; 0 when nothing was sent. */
export function acceptedPercent(sent: number, accepted: number): number {
  if (!(sent > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((accepted / sent) * 100)));
}

/** "1 project", "12 projects". */
export function countLabel(total: number): string {
  return `${total} ${total === 1 ? "project" : "projects"}`;
}
