export const DRIVES_HREF = "/employer/drives";

/** Phone tab bar: the places an employer returns to (the rest stay in the menu). Campus drives joins them once the company has a drive. */
export function employerTabHrefs(hasDrives: boolean): string[] {
  const tabs = ["/employer/dashboard", "/employer/candidates", "/employer/proposals", "/employer/cart"];
  return hasDrives ? [...tabs, DRIVES_HREF] : tabs;
}

/**
 * Adds the Campus drives item to the employer nav, after Interviews, when the company has a drive. The layout wraps every
 * employer page, so the item is there on all of them; it was never in the nav before, only reachable from the join redirect.
 */
export function withDrivesItem<G extends { items: { href: string }[] }, I extends { href: string }>(groups: G[], hasDrives: boolean, item: I): G[] {
  if (!hasDrives) return groups;
  return groups.map((g) => {
    const at = g.items.findIndex((i) => i.href === "/employer/schedule");
    return at < 0 ? g : { ...g, items: [...g.items.slice(0, at + 1), item, ...g.items.slice(at + 1)] };
  });
}
