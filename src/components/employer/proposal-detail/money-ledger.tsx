import { cn } from "@/lib/utils";

export type LedgerRow = {
  key: string;
  state: "done" | "current" | "todo" | "closed";
  title: string;
  /** The date this stage happened (or is due), already formatted. Never invented: a stage with no stored date shows none. */
  date?: string | null;
  detail?: React.ReactNode;
  /** The money that moves at this stage, already formatted. */
  amount?: string | null;
  amountNote?: string;
  /** A waived list price printed struck through before `amount`. */
  struck?: string;
};

/**
 * A proposal's life as a vertical ledger: date on the left, a rail with a node per stage, what happened in
 * the middle and the rupees that moved on the right. Reads top to bottom like a statement. Server-safe.
 * `attention` rings the current stage in the signal colour: the next move is the employer's (pay, confirm).
 */
export function MoneyLedger({ rows, attention = false }: { rows: LedgerRow[]; attention?: boolean }) {
  return (
    <ol aria-label="Offer ledger">
      {rows.map((r, i) => {
        const last = i === rows.length - 1;
        const quiet = r.state === "todo" || r.state === "closed";
        return (
          <li
            key={r.key}
            aria-current={r.state === "current" ? "step" : undefined}
            className="relative grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-4 border-t border-ink-200 py-4 first:border-t-0 sm:grid-cols-[7rem_1.25rem_minmax(0,1fr)_auto] sm:gap-x-5"
          >
            <p className={cn("nums hidden pt-0.5 text-sm sm:block", quiet ? "text-ink-600" : "text-ink-900")}>{r.date ?? ""}</p>
            <div className="relative flex justify-center pt-1.5">
              <span
                aria-hidden
                className={cn(
                  "relative z-10 size-3 rounded-full",
                  r.state === "done" && "bg-brand-700",
                  r.state === "current" && (attention ? "bg-surface-raised ring-2 ring-signal" : "bg-surface-raised ring-2 ring-brand-700"),
                  r.state === "todo" && "bg-surface-raised ring-1 ring-ink-300",
                  r.state === "closed" && "bg-ink-300",
                )}
              />
              {!last ? <span aria-hidden className={cn("absolute left-1/2 top-5 -bottom-4 w-px -translate-x-1/2", r.state === "done" ? "bg-brand-700" : "bg-ink-300")} /> : null}
            </div>
            <div className="min-w-0">
              <p className={cn("text-base leading-snug", quiet ? "text-ink-700" : "font-semibold text-ink-900")}>
                {r.title}
                <span className="sr-only">{r.state === "done" ? " (done)" : r.state === "current" ? " (next)" : r.state === "closed" ? " (did not happen)" : ""}</span>
              </p>
              {r.date ? <p className="nums mt-0.5 text-sm text-ink-700 sm:hidden">{r.date}</p> : null}
              {r.detail ? <div className="mt-1 max-w-prose text-pretty text-sm leading-relaxed text-ink-700">{r.detail}</div> : null}
            </div>
            {r.amount ? (
              <div className="text-right">
                <p className="nums font-display text-lg font-semibold leading-snug text-ink-900">
                  {r.struck ? <s className="mr-1.5 text-sm font-normal text-ink-600">{r.struck}</s> : null}
                  {r.amount}
                </p>
                {r.amountNote ? <p className="text-xs text-ink-600">{r.amountNote}</p> : null}
              </div>
            ) : (
              <span />
            )}
          </li>
        );
      })}
    </ol>
  );
}
