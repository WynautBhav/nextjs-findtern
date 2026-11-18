import { ageOf, type Age } from "./ageing";
import { cn } from "@/lib/utils";

/**
 * The admin money motif: a ruled ledger. Hairline rules between rows, a heavier rule under the header,
 * right-aligned tabular figures, and an optional age column whose number darkens to signal as an item
 * gets old. Below `md` each row becomes a ruled block (title, then label/value lines), never a card.
 * Server-component friendly; no state.
 *
 *   <Ledger caption="Open payouts" rows={rows} rowKey={(r) => r.id}
 *     columns={[{ key: "who", header: "Intern", cell: (r) => r.name, primary: true },
 *               { key: "amt", header: "Amount", align: "right", cell: (r) => <Money minor={r.minor} /> },
 *               { key: "age", header: "Waiting", align: "right", cell: (r) => <AgeCell from={r.since} /> }]} />
 */

export type LedgerColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  primary?: boolean;
  hideOnCard?: boolean;
  className?: string;
};

export function Ledger<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  footer,
  className,
}: {
  columns: LedgerColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  empty?: React.ReactNode;
  /** Totals row: one cell per column, rendered under a double rule. */
  footer?: React.ReactNode[];
  className?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary && !c.hideOnCard);
  return (
    <div className={className}>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b-2 border-ink-800">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-3 pb-2 pt-1 text-left text-sm font-medium text-ink-700 first:pl-0 last:pr-0", c.align === "right" && "text-right")}>
                  {c.header}
                </th>
              ))}
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
          {footer ? (
            <tfoot>
              <tr className="border-t-4 border-double border-ink-800">
                {footer.map((f, i) => (
                  <td key={i} className={cn("px-3 py-3 font-display text-base font-semibold text-ink-900 first:pl-0 last:pr-0", columns[i]?.align === "right" && "nums text-right")}>
                    {f}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <ul className="border-t-2 border-ink-800 md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className="border-b border-ink-200 py-3.5">
            <div className="font-medium text-ink-900">{primary.cell(r)}</div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {rest.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-ink-700">{c.header}</dt>
                  <dd className="nums min-w-0 break-words text-right text-ink-900">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

const BAND: Record<Age["band"], string> = {
  ok: "text-ink-700",
  aging: "font-medium text-ink-900",
  late: "font-semibold text-signal",
};

/** The age column cell: "5 d" in ink, signal once past a week, "–" when there is no date. */
export function AgeCell({ from, now }: { from: Date | string | number | null | undefined; now?: Date }) {
  const age = ageOf(from, now);
  if (!age) return <span className="text-ink-600">–</span>;
  return <span className={cn("nums", BAND[age.band])}>{age.label}</span>;
}

/** A rupee figure in the ledger: tabular, from minor units (paise). Zero reads as a dash. */
export function Money({ minor, className, signal }: { minor: number | null | undefined; className?: string; signal?: boolean }) {
  if (minor === null || minor === undefined) return <span className="text-ink-600">–</span>;
  const rupees = minor / 100;
  const text = rupees.toLocaleString("en-IN", { minimumFractionDigits: rupees % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return <span className={cn("money", signal && "text-signal", className)}>₹{text}</span>;
}
