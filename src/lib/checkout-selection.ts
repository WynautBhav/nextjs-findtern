/**
 * Which payable lines a checkout link shows (QA-139). A link that names a
 * proposal shows exactly that line; if it is not payable (not an accepted
 * offer, not a running placement's due month) the page says so instead of
 * quietly showing a different hire, which is how "Pay ₹29,000" for one hire
 * opened a checkout for another at ₹26,400. No proposal named: every line.
 */
export function selectCheckoutLines<T extends { id: string }>(
  lines: readonly T[],
  requestedId: string | null | undefined,
): { lines: T[]; requested: string | null; missing: boolean } {
  const requested = requestedId?.trim() || null;
  if (!requested) return { lines: [...lines], requested: null, missing: false };
  const match = lines.filter((l) => l.id === requested);
  return { lines: match, requested, missing: match.length === 0 };
}
