import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";

import { toQueryString } from "@/lib/admin/params";
import { cn } from "@/lib/utils";

/**
 * The payouts ledger: the same ruled table as `Ledger` (2px ink rule under the header, hairlines between rows,
 * right-aligned tabular figures, a ruled block per row below `md`), plus sortable headers and an action cell that
 * keeps its own full-width line on a phone. Server-component friendly; the action cell may hold a client component.
 */
export type PoColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  /** The row's title on a phone. */
  primary?: boolean;
  /** Renders under the row on a phone, with no label; its header is read by screen readers only. */
  action?: boolean;
  /** `?sort=<key>`: the header becomes a link. */
  sort?: string;
  className?: string;
};

export function PoLedger<T>({
  columns,
  rows,
  rowKey,
  caption,
  basePath,
  params,
}: {
  columns: PoColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  basePath: string;
  params: Record<string, string>;
}) {
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const action = columns.find((c) => c.action);
  const rest = columns.filter((c) => c !== primary && c !== action);
  return (
    <div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b-2 border-ink-800">
              {columns.map((c) => {
                const active = c.sort && params.sort === c.sort;
                const dir = active ? (params.dir === "asc" ? "asc" : "desc") : null;
                const nextDir = dir ? (dir === "desc" ? "asc" : "desc") : "desc";
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                    className={cn("px-3 pb-2 pt-1 text-left text-sm font-medium text-ink-700 first:pl-0 last:pr-0", c.align === "right" && "text-right")}
                  >
                    {c.action ? (
                      <span className="sr-only">{c.header}</span>
                    ) : c.sort ? (
                      <Link
                        href={`${basePath}${toQueryString({ ...params, sort: c.sort, dir: nextDir, page: "" })}`}
                        scroll={false}
                        className={cn(
                          "inline-flex min-h-8 items-center gap-1 rounded-md underline-offset-4 hover:text-ink-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          c.align === "right" && "flex-row-reverse",
                          active && "font-semibold text-ink-900",
                        )}
                      >
                        {c.header}
                        {dir === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : dir === "desc" ? <ArrowDown className="size-3.5" aria-hidden /> : null}
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
                  <td key={c.key} className={cn("px-3 py-3 align-top text-ink-900 first:pl-0 last:pr-0", c.align === "right" && "nums text-right", c.className)}>
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
              {rest.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-ink-700">{c.header}</dt>
                  <dd className="nums min-w-0 break-words text-right text-ink-900">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
            {action ? <div className="mt-2">{action.cell(r)}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
