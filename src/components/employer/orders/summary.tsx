import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HireRow } from "./types";
import { feePaidMinor } from "./shared";

/** Minor units per currency, so a ₹ figure and a $ figure are never added together. */
function byCurrency(hires: HireRow[], pick: (h: HireRow) => number): { currency: string; minor: number }[] {
  const by = new Map<string, number>();
  for (const h of hires) by.set(h.currency, (by.get(h.currency) ?? 0) + pick(h));
  return Array.from(by, ([currency, minor]) => ({ currency, minor }));
}

/** "₹2,70,000", or "₹32,000 + $400" when hires are billed in two currencies. */
function Figure({ parts }: { parts: { currency: string; minor: number }[] }) {
  const shown = parts.filter((p) => p.minor > 0);
  const list = shown.length ? shown : [{ currency: parts[0]?.currency ?? "INR", minor: 0 }];
  return (
    <>
      {list.map((p, i) => (
        <span key={p.currency}>
          {i > 0 ? <span className="px-1 text-ink-500">+</span> : null}
          {formatMoney(p.minor, p.currency, { zeroLabel: false })}
        </span>
      ))}
    </>
  );
}

/**
 * The band above the list. One bright figure (everything paid, hiring fees
 * included, so it is the same number the invoices add up to) and three quiet
 * ones that split it: placements + one-time hiring fees = total paid.
 * Figures only, no tiles; hairlines are the only structure.
 */
export function OrdersSummary({ hires }: { hires: HireRow[] }) {
  const paid = byCurrency(hires, (h) => h.ledger.paidMinor);
  const fees = byCurrency(hires, feePaidMinor);
  const placements = byCurrency(hires, (h) => h.ledger.paidMinor - feePaidMinor(h));
  const left = byCurrency(hires, (h) => h.ledger.dueMinor);
  const owing = left.some((l) => l.minor > 0);
  // "3 × ₹5,000" only when every paid fee is the same amount: real, never rounded.
  const feed = hires.filter((h) => feePaidMinor(h) > 0 && !h.fullTime);
  const sameFee = feed.length > 1 && feed.every((h) => h.feeMinor === feed[0].feeMinor && h.currency === feed[0].currency);

  const quiet: { label: string; parts: { currency: string; minor: number }[]; note?: string; muted?: boolean }[] = [
    { label: "Placements", parts: placements },
    { label: "Hiring fees", parts: fees, note: sameFee ? `${feed.length} × ${formatMoney(feed[0].feeMinor, feed[0].currency, { zeroLabel: false })}, one-time` : "One-time, per hire" },
    { label: "Still to pay", parts: left, muted: !owing },
  ];

  return (
    <section aria-label="Payment summary" className="mb-8 grid gap-6 border-y border-ink-200 py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end lg:gap-10 lg:py-8">
      <div>
        <p className="text-sm font-medium text-ink-700">Total paid</p>
        <p className="nums mt-1.5 text-[2.5rem] font-medium leading-none tracking-[-0.03em] text-brand-800 sm:text-[2.75rem]">
          <Figure parts={paid} />
        </p>
        <p className="mt-2.5 text-sm text-ink-600">
          Across {hires.length} {hires.length === 1 ? "hire" : "hires"}, hiring fees included
        </p>
      </div>
      <dl className="grid grid-cols-3 items-start gap-x-4 lg:gap-x-0 lg:divide-x lg:divide-ink-200">
        {quiet.map((q, i) => (
          <div key={q.label} className={cn("min-w-0", i > 0 && "lg:pl-6", i < quiet.length - 1 && "lg:pr-6")}>
            <dt className="whitespace-nowrap text-xs font-medium text-ink-600">{q.label}</dt>
            <dd className={cn("nums mt-1.5 text-lg font-medium leading-tight tracking-[-0.01em] sm:text-xl", q.muted ? "text-ink-600" : "text-ink-900")}>
              <Figure parts={q.parts} />
            </dd>
            {q.note ? <p className="mt-1 text-sm text-ink-600">{q.note}</p> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
