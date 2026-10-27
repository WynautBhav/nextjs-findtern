import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminEmpty } from "./panel.tsx";
import { PageSizeSelect } from "./page-size-select.tsx";
import { Pagination } from "./pagination.tsx";
import { TableToolbar, type ToolbarFilter } from "./table-toolbar.tsx";
import { toQueryString } from "@/lib/admin/params";
import { cn } from "@/lib/utils";

/**
 * DataTable - the shared shell for every admin list.
 *
 * Owns the chrome (toolbar row, header, pager) so each page only
 * declares its columns and how to render a row. That is what stops the three
 * hand-rolled tables from drifting: they had different header padding, one had
 * no pager, and one showed a "CSV" button that downloaded the whole table
 * regardless of the filter on screen.
 *
 * Two accessibility behaviours worth keeping:
 *  - The empty state replaces the table body but keeps the toolbar, so the
 *    filters that produced the empty result are still visible and removable.
 *  - Each cell that contains an interactive element gets `px-3` rather than the
 *    shadcn default `p-2`, because a button inside a `whitespace-nowrap` cell
 *    with 8px of padding reads as cramped and clips its focus ring.
 */

export type Column<T> = {
  /** Visible header text. Keep it short - the header row is nowrap. */
  header: React.ReactNode;
  /** Renders the cell. */
  cell: (row: T, index: number) => React.ReactNode;
  /** Extra classes on every cell in this column. */
  className?: string;
  headerClassName?: string;
  /** Column header class for right-aligned numeric columns. */
  align?: "left" | "right";
  /**
   * Makes the header a sort link: `?sort=<key>&dir=asc|desc`. The page reads
   * the same two params (see `parseSort`) and orders its query by them.
   */
  sort?: string;
};

/** Reads `sort` / `dir` from the URL, keeping only keys the page allows. */
export function parseSort<K extends string>(
  params: Record<string, string>,
  allowed: readonly K[],
  fallback: { key: K; dir: "asc" | "desc" },
): { key: K; dir: "asc" | "desc" } {
  const key = allowed.find((k) => k === params.sort);
  if (!key) return fallback;
  return { key, dir: params.dir === "asc" ? "asc" : "desc" };
}

export function DataTable<T>({
  basePath,
  params,
  page,
  pages,
  total,
  perPage,
  columns,
  rows,
  renderRow,
  noun = "records",
  searchPlaceholder,
  filters,
  exportHref,
  extraControls,
  empty,
  dense = false,
  className,
  caption,
  pageKey,
  perKey,
}: {
  basePath: string;
  params: Record<string, string>;
  page: number;
  pages: number;
  total: number;
  perPage: number;
  columns: Column<T>[];
  rows: T[];
  /** Row renderer, so callers can add hover/selection behaviour. */
  renderRow?: (row: T, index: number) => React.ReactElement<typeof TableRow>;
  noun?: string;
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  exportHref?: string;
  extraControls?: React.ReactNode;
  empty?: { title: string; body: string; action?: { href: string; label: string } };
  dense?: boolean;
  className?: string;
  /** Screen-reader caption; the visual header row is aria-hidden by pattern. */
  caption?: string;
  /**
   * Query keys this table owns. Two tables on one page must not share them,
   * or their pagers overwrite each other in the URL.
   */
  pageKey?: string;
  perKey?: string;
}) {
  const hasToolbar = Boolean(searchPlaceholder || filters?.length || exportHref || extraControls);
  const cellPad = dense ? "px-3 py-2.5" : "px-3 py-3";

  return (
    <div
      className={cn(
        "apple-panel apple-admin overflow-hidden bg-white",
        className,
      )}
    >
      {hasToolbar ? (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
            <TableToolbar
              searchPlaceholder={searchPlaceholder}
              filters={filters}
              exportHref={exportHref}
              extra={extraControls}
            />
          </div>
          <PageSizeSelect pageKey={perKey ?? "per"} />
        </div>
      ) : null}

      {rows.length === 0 ? (
        empty ? (
          <AdminEmpty {...empty} />
        ) : (
          <AdminEmpty
            title="No results"
            body="Nothing matches the current search and filters."
          />
        )
      ) : (
        <>
        {/* The Table primitive scrolls sideways inside its own container, so
            `sticky` on the header never had anything to pin to. `min-w-[40rem]`
            keeps the columns readable below the sidebar breakpoint instead of
            squeezing every cell into a word-per-line stack. */}
        <p className="border-b border-ink-100 px-5 py-1.5 text-xs text-text-subtle lg:hidden" aria-hidden>
          Scroll sideways to see every column →
        </p>
        {/* The header is sticky inside this scroller, so long tables keep
            their column names in view without the page losing its own scroll. */}
        <div className="max-h-[min(72vh,56rem)] overflow-auto [&>[data-slot=table-container]]:overflow-visible">
        <Table className="min-w-[40rem]">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column, index) => {
                const active = column.sort && params.sort === column.sort;
                const dir = active ? (params.dir === "asc" ? "asc" : "desc") : null;
                const nextDir = dir === "desc" ? "asc" : "desc";
                return (
                  <TableHead
                    key={index}
                    scope="col"
                    aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                    className={cn(
                      "sticky top-0 z-10 bg-ink-50 px-3 py-2.5 text-xs font-semibold tracking-[0.01em] text-ink-600",
                      column.align === "right" && "text-right",
                      column.headerClassName,
                    )}
                  >
                    {column.sort ? (
                      <Link
                        href={`${basePath}${toQueryString({ ...params, sort: column.sort, dir: nextDir, [pageKey ?? "page"]: "" })}`}
                        scroll={false}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-apple-sm hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-brand-600",
                          column.align === "right" && "flex-row-reverse",
                          active && "text-ink-900",
                        )}
                      >
                        {column.header}
                        {dir === "asc" ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : dir === "desc" ? (
                          <ArrowDown className="size-3" aria-hidden />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" aria-hidden />
                        )}
                      </Link>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const tr = renderRow ? (
                renderRow(row, index)
              ) : (
                <TableRow key={index} className="border-ink-100 hover:bg-ink-50/60">
                  {columns.map((column, cellIndex) => (
                    <TableCell
                      key={cellIndex}
                      className={cn(
                        cellPad,
                        "text-sm text-ink-700",
                        column.align === "right" && "nums text-right",
                        column.className,
                      )}
                    >
                      {column.cell(row, index)}
                    </TableCell>
                  ))}
                </TableRow>
              );
              return tr;
            })}
          </TableBody>
        </Table>
        </div>
        </>
      )}

      {rows.length > 0 ? (
        <Pagination
          page={page}
          pages={pages}
          total={total}
          perPage={perPage}
          rowsShown={rows.length}
          params={params}
          basePath={basePath}
          noun={noun}
          pageKey={pageKey ?? "page"}
        />
      ) : null}
    </div>
  );
}
