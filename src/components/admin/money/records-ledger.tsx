import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { EmptyScene } from "@/components/app/primitives";
import { PageSizeSelect } from "@/components/admin/page-size-select";
import { Pager } from "@/components/admin/pagination";
import { hasActiveFilters } from "@/components/admin/table-state";
import { TableToolbar, type ToolbarFilter } from "@/components/admin/table-toolbar";
import { toQueryString } from "@/lib/admin/params";
import { cn } from "@/lib/utils";

/**
 * The paged, filterable ledger of the money screens (orders, transactions, refunds): the same ruled look as the
 * dashboard's ledgers (heavy rule under the header, hairlines between rows, tabular right-aligned figures),
 * plus what a working list needs: URL-state toolbar, sortable headers, a header that stays put while the body
 * scrolls, a pager, and below `md` one ruled block per row (label/value lines), never a card. Server component.
 */

export type RecordColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  /** Makes the header a sort link (?sort=<key>&dir=). */
  sort?: string;
  /** The row's title on a phone. */
  primary?: boolean;
  /** Left out of the phone block (e.g. actions are shown under the title instead). */
  actions?: boolean;
  hideOnCard?: (row: T) => boolean;
  className?: string;
};

export function RecordsLedger<T>({
  basePath,
  params,
  page,
  pages,
  total,
  perPage,
  columns,
  rows,
  rowKey,
  caption,
  noun,
  searchPlaceholder,
  filters,
  exportHref,
  extra,
  empty,
}: {
  basePath: string;
  params: Record<string, string>;
  page: number;
  pages: number;
  total: number;
  perPage: number;
  columns: RecordColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  noun: string;
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  exportHref?: string;
  extra?: React.ReactNode;
  empty: { title: string; body: string; next: { label: string; href: string } };
}) {
  const filterKeys = (filters ?? []).map((f) => f.key);
  const filtered = hasActiveFilters(params, filterKeys);
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const actions = columns.find((c) => c.actions);
  const rest = columns.filter((c) => c !== primary && c !== actions);
  const sortOptions = columns.flatMap((c) => (c.sort ? [{ value: c.sort, label: c.header }] : []));
  const clearHref = (() => {
    const kept = { ...params };
    delete kept.q;
    delete kept.page;
    for (const key of filterKeys) delete kept[key];
    return `${basePath}${toQueryString(kept)}`;
  })();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 max-sm:basis-full">
          <TableToolbar searchPlaceholder={searchPlaceholder} filters={filters} exportHref={exportHref} extra={extra} sortOptions={sortOptions} />
        </div>
        <PageSizeSelect perKey="per" pageKey="page" />
      </div>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyScene title="Nothing matches" body={`No ${noun} fit this search and these filters.`} next={{ label: "Clear search and filters", href: clearHref }} />
        ) : (
          <EmptyScene {...empty} />
        )
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr>
                  {columns.map((c) => {
                    const active = c.sort && params.sort === c.sort;
                    const dir = active ? (params.dir === "asc" ? "asc" : "desc") : null;
                    const next = dir === "desc" ? "asc" : "desc";
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                        className={cn(
                          "sticky top-0 z-10 border-b-2 border-ink-800 bg-[color:var(--color-paper)] px-3 pb-2 pt-1 text-left text-sm font-medium text-ink-700 first:pl-0 last:pr-0",
                          c.align === "right" && "text-right",
                        )}
                      >
                        {c.sort ? (
                          <Link
                            href={`${basePath}${toQueryString({ ...params, sort: c.sort, dir: next, page: "" })}`}
                            scroll={false}
                            className={cn("inline-flex items-center gap-1 rounded-md hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", c.align === "right" && "flex-row-reverse", active && "text-ink-900")}
                          >
                            {c.header}
                            {dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : dir === "desc" ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUpDown className="size-3 opacity-50" aria-hidden />}
                          </Link>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={rowKey(r)} className="border-b border-ink-200 transition-colors duration-[var(--motion-fast)] hover:bg-ink-100/60">
                    {columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-3 align-middle text-ink-900 first:pl-0 last:pr-0", c.align === "right" && "nums text-right", c.className)}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="border-t-2 border-ink-800 md:hidden" aria-label={caption}>
            {rows.map((r) => (
              <li key={rowKey(r)} className="border-b border-ink-200 py-3.5">
                <div className="font-medium text-ink-900">{primary.cell(r)}</div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {rest.filter((c) => !c.hideOnCard?.(r)).map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-ink-700">{c.header}</dt>
                      <dd className="nums min-w-0 break-words text-right text-ink-900">{c.cell(r)}</dd>
                    </div>
                  ))}
                </dl>
                {actions ? <div className="mt-3 flex justify-end">{actions.cell(r)}</div> : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <Pager page={page} pages={pages} total={total} perPage={perPage} rowsShown={rows.length} params={params} basePath={basePath} noun={noun} />
    </div>
  );
}
