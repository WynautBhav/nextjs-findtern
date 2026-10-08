import Link from "next/link";

import { toQueryString } from "@/lib/admin/params";
import { cn } from "@/lib/utils";

/**
 * Pagination.
 *
 * A server component rendering plain `<Link>`s — no client JS, so it works
 * before hydration and can be middle-clicked. The page numbers are a windowed
 * sequence with ellipses, because a 88-page intern table rendered as
 * "1 2 3 4 5 6 7 8 9 … 88" pushes the useful control off the right edge.
 *
 * `aria-current="page"` marks the active page, and the prev/next controls
 * disable rather than vanish, so the pager does not reflow as you move
 * through it.
 */

/** Builds the page list: 1 … 4 5 [6] 7 8 … 88 */
function pageWindow(current: number, total: number, span = 1): (number | "gap")[] {
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
    if (previous && page - previous > 1) out.push("gap");
    out.push(page);
    previous = page;
  }
  return out;
}

export function Pagination({
  page,
  pages,
  total,
  perPage,
  rowsShown,
  params,
  basePath,
  noun = "records",
  pageKey,
}: {
  page: number;
  pages: number;
  total: number;
  perPage: number;
  rowsShown: number;
  /** Current query params, so page links preserve search and filters. */
  params: Record<string, string>;
  basePath: string;
  noun?: string;
  /** Query key holding the page number, so two tables can coexist. */
  pageKey?: string;
}) {
  if (total === 0) return null;

  const pageParam = pageKey ?? "page";
  const from = (page - 1) * perPage + 1;
  const to = Math.min(from + rowsShown - 1, total);

  const href = (target: number) =>
    `${basePath}${toQueryString({ ...params, [pageParam]: String(target) })}`;

  const linkBase =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition-colors";

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-5 py-3"
    >
      <p className="text-xs text-text-subtle">
        Showing{" "}
        <span className="font-medium text-ink-700 tabular-nums">
          {from.toLocaleString("en-IN")} to {to.toLocaleString("en-IN")}
        </span>{" "}
        of{" "}
        <span className="font-medium text-ink-700 tabular-nums">
          {total.toLocaleString("en-IN")}
        </span>{" "}
        {noun}
      </p>

      <div className="flex items-center gap-1">
        <Link
          href={href(Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          aria-label="Previous page"
          tabIndex={page <= 1 ? -1 : undefined}
          className={cn(
            linkBase,
            "border border-ink-200 text-ink-700",
            page <= 1
              ? "pointer-events-none text-ink-300"
              : "hover:bg-ink-50 hover:border-ink-300",
          )}
        >
          Previous
        </Link>

        {pageWindow(page, pages).map((entry, index) =>
          entry === "gap" ? (
            <span key={`gap-${index}`} aria-hidden className="px-1 text-ink-400">
              …
            </span>
          ) : (
            <Link
              key={entry}
              href={href(entry)}
              aria-current={entry === page ? "page" : undefined}
              aria-label={`Page ${entry}`}
              className={cn(
                linkBase,
                entry === page
                  ? "bg-brand-700 text-white"
                  : "border border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300",
              )}
            >
              {entry}
            </Link>
          ),
        )}

        <Link
          href={href(Math.min(pages, page + 1))}
          aria-disabled={page >= pages}
          aria-label="Next page"
          tabIndex={page >= pages ? -1 : undefined}
          className={cn(
            linkBase,
            "border border-ink-200 text-ink-700",
            page >= pages
              ? "pointer-events-none text-ink-300"
              : "hover:bg-ink-50 hover:border-ink-300",
          )}
        >
          Next
        </Link>
      </div>
    </nav>
  );
}
