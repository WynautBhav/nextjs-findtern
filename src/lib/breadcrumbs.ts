/**
 * Breadcrumb labels from a pathname.
 *
 * Both app shells derived crumbs by splitting the URL and capitalising each
 * segment, which printed raw UUIDs ("763872fb 0512 49e9 …") on every detail
 * page and "Cms" for the website editor. Known paths map to the same labels
 * the sidebar uses; ids collapse to one word. Zero imports, safe for tests.
 */
export type Crumb = { href: string; label: string; link: boolean };

const ID_LIKE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|\d{4,})$/i;

export function breadcrumbsFor(
  pathname: string,
  labels: Record<string, string>,
  idLabel = "Details",
  /**
   * URL segments that aren't pages but belong to one: "/employer/proposal"
   * (the detail's parent segment) reads "Proposals" and links to the list.
   */
  parents: Record<string, { label: string; href: string }> = {},
): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const out: Crumb[] = [];
  // Skip the role segment (/admin, /employer, /intern).
  for (let i = 1; i < parts.length; i += 1) {
    const href = `/${parts.slice(0, i + 1).join("/")}`;
    const part = parts[i];
    const parent = parents[href];
    if (parent) {
      out.push({ href: parent.href, label: parent.label, link: true });
      continue;
    }
    // An empty idLabel drops record ids: the page title already names it.
    if (ID_LIKE.test(part) && idLabel === "") continue;
    const label = ID_LIKE.test(part)
      ? idLabel
      : (labels[href] ?? part.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase()));
    // Only a known route gets a link: "/employer/intern" is a URL segment,
    // not a page, and linking it 404s (and makes the router prefetch a 404).
    out.push({ href, label, link: href in labels });
  }
  return out;
}
