import { cn } from "@/lib/utils";

/**
 * A data table that stays readable everywhere: a sticky header and tabular numerals from `md` up,
 * and below that each row becomes a stacked card (the first column is the card's title; the other
 * columns become label/value pairs). Server-component friendly: no state.
 *
 *   <DataTable rows={rows} rowKey={(r) => r.id} empty={<EmptyScene .../>}
 *     columns={[{ key: "name", header: "Name", cell: (r) => r.name, primary: true },
 *               { key: "amt", header: "Amount", cell: (r) => <span className="money">₹{r.amt}</span>, align: "right" }]} />
 */

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  /** The card's title on a phone (default: the first column). */
  primary?: boolean;
  /** Hide this column on a phone card. */
  hideOnCard?: boolean;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: React.ReactNode;
  /** Names the table for screen readers. */
  caption: string;
  className?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary && !c.hideOnCard);
  return (
    <div className={className}>
      <div className="hidden max-h-[70vh] overflow-auto rounded-lg border border-ink-200 bg-surface-raised md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn("sticky top-0 z-10 border-b border-ink-300 bg-ink-100 px-4 py-2.5 text-left text-sm font-semibold text-ink-700", c.align === "right" && "text-right")}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {rows.map((r) => (
              <tr key={rowKey(r)} className="transition-colors duration-[var(--motion-fast)] hover:bg-ink-100/70">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle text-ink-800", c.align === "right" && "nums text-right", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-ink-200 rounded-lg border border-ink-200 bg-surface-raised md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className="px-4 py-3.5">
            <div className="font-medium text-ink-900">{primary.cell(r)}</div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {rest.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-ink-600">{c.header}</dt>
                  <dd className="nums min-w-0 text-right text-ink-800 [overflow-wrap:anywhere]">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
