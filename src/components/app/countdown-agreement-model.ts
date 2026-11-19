/**
 * What the read-and-agree dialog tells the person while its confirm button is locked (B-41). The button used to be
 * the only place the wait showed, and once the seconds ran out it stayed disabled with nothing to say why; the line
 * built here sits beside the button, outside the scrolling terms, for the whole disabled period.
 */
export function agreementWait(left: number, agreed: boolean, busy: boolean): string | null {
  if (busy) return null;
  if (left > 0) return `You can continue in ${left}s${agreed ? "" : ", once you tick the box"}.`;
  if (!agreed) return "Tick the box above to continue.";
  return null;
}

/** The confirm button's label: the seconds left show on it until it is ready. */
export function confirmButtonLabel(confirmLabel: string, left: number): string {
  return left > 0 ? `${confirmLabel} (${left}s)` : confirmLabel;
}
