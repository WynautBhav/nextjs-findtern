/**
 * Pure rules shared by the two skill comboboxes (`SkillFilter` and
 * `ChipInput`), kept out of the components so they can be tested without a
 * browser. No imports: the node test runner loads this file as is.
 */

/** What a combobox's arrow key does to the list. */
export type ArrowResult = { open: boolean; highlight: number } | null;

/**
 * ArrowDown / ArrowUp on the input. `count` is how many rows the current query
 * offers, whether or not the list is showing.
 *
 * - Closed list with something to offer (after Escape, or a refocus): the arrow
 *   reopens it with the current query and lands on the first row (Down) or the
 *   last (Up), as the ARIA combobox pattern expects.
 * - Open list: walk the rows, wrapping at both ends.
 * - Nothing to offer: `null`, so the caller leaves the key alone.
 */
export function arrowKey(key: string, state: { open: boolean; count: number; highlight: number }): ArrowResult {
  if (key !== "ArrowDown" && key !== "ArrowUp") return null;
  const { open, count, highlight } = state;
  if (count <= 0) return null;
  const down = key === "ArrowDown";
  if (!open) return { open: true, highlight: down ? 0 : count - 1 };
  if (highlight < 0) return { open: true, highlight: down ? 0 : count - 1 };
  return { open: true, highlight: (highlight + (down ? 1 : -1) + count) % count };
}

/**
 * The line shown when a list is at its limit, so the add control never just
 * disappears. `null` below the limit. `noun` finishes "7 of 7 ...".
 */
export function limitNote(count: number, max: number, noun: string): string | null {
  if (count > max) return `Saved under an older limit. Remove ${count - max + 1} to add a new one.`;
  if (count === max) return `${max} of ${max} ${noun}. Remove one to add another.`;
  return null;
}
