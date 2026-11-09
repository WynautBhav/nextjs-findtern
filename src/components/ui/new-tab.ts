/** One place for "open this link in a new tab": the attributes and the screen-reader hint. */
export const NEW_TAB_ATTRS = { target: "_blank", rel: "noopener noreferrer" } as const;
export const NEW_TAB_HINT = " (opens in new tab)";

/** Spread onto an <a>/<Link>: adds target + rel when `on`, nothing otherwise. */
export function newTabAttrs(on?: boolean): { target?: "_blank"; rel?: string } {
  return on ? NEW_TAB_ATTRS : {};
}
