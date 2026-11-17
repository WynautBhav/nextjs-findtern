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

/**
 * Where checkout goes after a payment lands. The paid proposal is no longer payable,
 * so staying on `?proposal=<id>` would answer "This placement can't be paid here";
 * this link names no proposal and carries the receipt flag instead.
 */
export const AFTER_PAYMENT_HREF = "/employer/checkout?paid=1";

export function justPaid(param: string | string[] | undefined): boolean {
  return (Array.isArray(param) ? param[0] : param) === "1";
}

/** Which body checkout renders: the payable lines, the receipt just after paying, or one of the two empty states. */
export function checkoutView(
  selection: { lines: readonly unknown[]; missing: boolean },
  paid: boolean,
): "lines" | "receipt" | "missing" | "empty" {
  if (selection.lines.length > 0) return "lines";
  if (paid) return "receipt";
  return selection.missing ? "missing" : "empty";
}
