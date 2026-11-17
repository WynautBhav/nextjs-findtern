// Shared wording and props for a taken-down project's view-only UI. Pure: the node tests run this file directly.

export const TAKEN_DOWN_EXPLAIN = "Taken down by Findtern: view only. Contact admin to resolve this.";
export const TAKEN_DOWN_SHORT = "Taken down: contact admin";

/** Spread onto a button / input for a taken-down project: really disabled, not focusable, aria-disabled, explained. */
export function disabledProps(down: boolean): { disabled?: true; "aria-disabled"?: true; title?: string; tabIndex?: -1 } {
  return down ? { disabled: true, "aria-disabled": true, title: TAKEN_DOWN_EXPLAIN, tabIndex: -1 } : {};
}
