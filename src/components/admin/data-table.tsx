import { cloneElement } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminEmpty } from "./panel.tsx";
import { DataTableKeys } from "./data-table-keys.tsx";
import { PageSizeSelect } from "./page-size-select.tsx";
import { Pager } from "./pagination.tsx";
import { SortSelect } from "./sort-select.tsx";
import { hasActiveFilters } from "./table-state.ts";
import { TableToolbar, type ToolbarFilter } from "./table-toolbar.tsx";
import { toQueryString } from "@/lib/admin/params";
import { cn } from "@/lib/utils";

/**
 * DataTable - the shared shell for every admin list. It composes the headless
 * parts (`table-state.ts` / `useUrlTableState`, `TableToolbar`, `SortSelect`,
 * `PageSizeSelect`, `Pager`), which a redesigned page can also use on its own.
 * The shell itself is flat: a 1px `border-border` rule on the page ground, no
 * shadow (SPECS 3 Nov). A page that wants a lifted ground passes `className`.
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
  /**
   * The cell's label in the stacked phone layout, when `header` is not plain
   * text. Leave both unset (checkbox, actions) for a cell with no label.
   */
  label?: string;
  /** Renders the cell. */
  cell: (row: T, index: number) => React.ReactNode;
  /** Extra classes on every cell in this column. */
  className?: string;
  headerClassName?: string;
  /** Column header class for right-aligned numeric columns. */
  align?: "left" | "right";
  /** A figure column: right-aligned (header and cells) with tabular figures (`nums`). */
  numeric?: boolean;
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

export type DataTableDensity = "comfortable" | "compact" | "ledger";

const CELL_PAD: Record<DataTableDensity, string> = {
  comfortable: "px-3 py-3",
  compact: "px-3 py-2",
  ledger: "px-3 py-1.5",
};

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
  rowClassName,
  noun = "records",
  searchPlaceholder,
  filters,
  exportHref,
  extraControls,
  empty,
  dense = false,
  density,
  stickyHeader = false,
  keyboardNav = false,
  onRowOpen,
  onRowPeek,
  rowHref,
  rowKey,
  footer,
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
  /** Extra classes on every row (default rows only). */
  rowClassName?: string;
  noun?: string;
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  exportHref?: string;
  extraControls?: React.ReactNode;
  empty?: { title: string; body: string; action?: { href: string; label: string } };
  /** Alias for `density="compact"`. */
  dense?: boolean;
  /**
   * Row padding. `compact` is tighter; `ledger` is tighter still and, with
   * `numeric` columns, reads as a ledger of right-aligned figures.
   */
  density?: DataTableDensity;
  /** Pins the header while the body scrolls (the table gets a viewport-bound scroll area on desktop). */
  stickyHeader?: boolean;
  /**
   * Roving-focus list: j / ArrowDown and k / ArrowUp move the active row, Enter
   * opens it (`onRowOpen`, else `rowHref`), `x` toggles the row's selection
   * checkbox when it has one. Ignored while typing in a field or with a
   * modifier held.
   */
  keyboardNav?: boolean;
  /** Enter on the active row. A function, so only usable when DataTable is rendered from a client component; from a server page use `rowHref`. */
  onRowOpen?: (row: T) => void;
  /** Space on the active row (keyboardNav only). Same client-component caveat as `onRowOpen`. */
  onRowPeek?: (row: T) => void;
  /** Enter on the active row follows this link. Resolved on the server, so it works from any page. */
  rowHref?: (row: T) => string;
  /** React key per row (default: the row's index). */
  rowKey?: (row: T) => string;
  /** Rendered in a `<tfoot>` row spanning every column, e.g. totals. */
  footer?: React.ReactNode;
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
  // Below lg the header row is hidden, so sortable columns also get a select.
  const sortOptions = columns.flatMap((c) =>
    c.sort ? [{ value: c.sort, label: typeof c.header === "string" ? c.header : (c.label ?? c.sort) }] : [],
  );
  const filterKeys = (filters ?? []).map((f) => f.key);
  const filtered = hasActiveFilters(params, filterKeys);
  const clearHref = (() => {
    const kept = { ...params };
    delete kept.q;
    delete kept[pageKey ?? "page"];
    for (const key of filterKeys) delete kept[key];
    return `${basePath}${toQueryString(kept)}`;
  })();
  const resolvedDensity: DataTableDensity = density ?? (dense ? "compact" : "comfortable");
  const cellPad = CELL_PAD[resolvedDensity];
  const wrapperClass = stickyHeader
    ? // The Table primitive's own container is the scroller, so the cap goes
      // on it. Desktop only: below lg the table stacks and the header is hidden.
      "lg:[&_[data-slot=table-container]]:max-h-[calc(100dvh-14rem)] lg:[&_[data-slot=table-container]]:overflow-auto lg:[&_[data-slot=table-container]]:scroll-pt-10"
    : undefined;
  // Stacked phone layout: the first plain-text column is the row's title,
  // the others carry their header as a label.
  // keyboardNav wraps the rows in a small client component; otherwise this stays a plain div.
  const wrapTable = (children: React.ReactNode) =>
    keyboardNav ? (
      <DataTableKeys<T>
        className={wrapperClass}
        rows={onRowOpen || onRowPeek ? rows : undefined}
        hrefs={rowHref ? rows.map((r) => rowHref(r)) : undefined}
        onRowOpen={onRowOpen}
        onRowPeek={onRowPeek}
      >
        {children}
      </DataTableKeys>
    ) : (
      <div data-stack className={wrapperClass}>
        {children}
      </div>
    );
  const labelOf = (c: Column<T>) => (typeof c.header === "string" ? c.header : c.label);
  const titleIndex = columns.findIndex((c) => typeof c.header === "string");
  const stackAttrs = (i: number) =>
    i === titleIndex ? { "data-title": "" } : labelOf(columns[i]) ? { "data-label": labelOf(columns[i]) } : {};

  return (
    <div className={cn("apple-admin overflow-hidden border border-border", className)}>
      {hasToolbar ? (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-3.5">
          {/* On a phone the filters take the full row and Rows drops below
              them, so a long select never runs into the label (QA-141). */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 max-sm:basis-full">
            <TableToolbar
              searchPlaceholder={searchPlaceholder}
              filters={filters}
              exportHref={exportHref}
              extra={extraControls}
              pageKey={pageKey ?? "page"}
              sortOptions={sortOptions}
            />
          </div>
          <PageSizeSelect perKey={perKey ?? "per"} pageKey={pageKey ?? "page"} />
        </div>
      ) : sortOptions.length ? (
        <div className="border-b border-border px-5 py-3 lg:hidden">
          <SortSelect options={sortOptions} />
        </div>
      ) : null}

      {rows.length === 0 ? (
        // "Nothing matches" (clearable) and "no data yet" are different
        // states; a filtered empty list must not read as an empty database.
        filtered ? (
          <AdminEmpty
            title="Nothing matches"
            body="No rows fit the current search and filters. Clear them to see everything."
            action={{ href: clearHref, label: "Clear search and filters" }}
          />
        ) : empty ? (
          <AdminEmpty {...empty} />
        ) : (
          <AdminEmpty title="No data yet" body={`There are no ${noun} here yet.`} />
        )
      ) : (
        <>
        {/* The Table primitive scrolls sideways inside its own container, so
            `sticky` on the header never had anything to pin to. `min-w-[40rem]`
            keeps the columns readable below the sidebar breakpoint instead of
            squeezing every cell into a word-per-line stack. */}
        {/* No inner height cap: the list is paged, and a second scrollbar
            stopped every list around row 8. Below lg the table stacks into
            one block per row (data-stack, globals.css) instead of scrolling
            sideways with only the name column in view. */}
        {wrapTable(
        <Table className="lg:min-w-[40rem]">
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
                      "bg-surface px-3 py-2.5 text-xs font-semibold tracking-[0.01em] text-text-subtle",
                      stickyHeader && "sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--color-border)]",
                      (column.align === "right" || column.numeric) && "text-right",
                      column.headerClassName,
                    )}
                  >
                    {column.sort ? (
                      <Link
                        href={`${basePath}${toQueryString({ ...params, sort: column.sort, dir: nextDir, [pageKey ?? "page"]: "" })}`}
                        scroll={false}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-apple-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                          (column.align === "right" || column.numeric) && "flex-row-reverse",
                          active && "text-foreground",
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
                <TableRow key={rowKey ? rowKey(row) : index} className={cn("border-border hover:bg-surface/60", rowClassName)}>
                  {columns.map((column, cellIndex) => (
                    <TableCell
                      key={cellIndex}
                      {...stackAttrs(cellIndex)}
                      className={cn(
                        cellPad,
                        "text-sm text-foreground",
                        (column.align === "right" || column.numeric) && "nums text-right",
                        column.className,
                      )}
                    >
                      {column.cell(row, index)}
                    </TableCell>
                  ))}
                </TableRow>
              );
              return renderRow && rowKey ? cloneElement(tr, { key: rowKey(row) }) : tr;
            })}
          </TableBody>
          {footer ? (
            <TableFooter className="border-border bg-surface max-lg:block">
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className={cn(cellPad, "text-sm text-foreground")}>
                  {footer}
                </TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>,
        )}
        </>
      )}

      <Pager
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
    </div>
  );
}
