import { CheckCircle2 } from "lucide-react";

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
        <span key={p.currency} className="whitespace-nowrap">
          {i > 0 ? <span className="px-1 font-medium text-ink-600"> + </span> : null}
          {formatMoney(p.minor, p.currency, { zeroLabel: false })}
        </span>
      ))}
    </>
  );
}

/**
 * The card above the list: the one big figure (everything paid, hiring fees
 * included, so it is the same number the invoices add up to), what is still to
 * pay, and an inset panel splitting the total into placements and one-time
 * hiring fees with a thin bar. The bar is drawn only when every hire bills in
 * one currency, so two currencies are never mixed into one proportion.
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

  const totalMinor = paid.reduce((n, p) => n + p.minor, 0);
  const feeMinor = fees.reduce((n, p) => n + p.minor, 0);
  const bar = paid.length === 1 && totalMinor > 0 ? { fee: (feeMinor / totalMinor) * 100, place: ((totalMinor - feeMinor) / totalMinor) * 100 } : null;

  const legend: { label: string; parts: { currency: string; minor: number }[]; note: string; swatch: string }[] = [
    { label: "Placements", parts: placements, swatch: "bg-brand-700", note: `Across ${hires.length} ${hires.length === 1 ? "hire" : "hires"}` },
    { label: "Hiring fees", parts: fees, swatch: "bg-brand-300", note: sameFee ? `${feed.length} × ${formatMoney(feed[0].feeMinor, feed[0].currency, { zeroLabel: false })}, one-time` : "One-time, per hire" },
  ];

  return (
    <section aria-label="Payment summary" className="mb-4 rounded-2xl border border-ink-200 bg-white p-4 shadow-xs sm:mb-5 sm:p-5 lg:p-6">
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-800">Total paid</p>
          <p className="nums mt-1 break-words text-[2rem] font-bold leading-tight tracking-[-0.02em] tabular-nums text-brand-700 sm:text-[2.25rem]">
            <Figure parts={paid} />
          </p>
          <p className="mt-1 text-sm text-ink-700">Hiring fees included</p>
          <p
            className={cn(
              "mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset",
              owing ? "bg-accent-100 text-accent-700 ring-accent-300/70" : "bg-brand-50 text-brand-800 ring-brand-200/70",
            )}
          >
            {owing ? null : <CheckCircle2 className="size-4" aria-hidden />}
            <span>Still to pay</span>
            <span className="nums font-bold tabular-nums">
              <Figure parts={left} />
            </span>
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-ink-200 bg-ink-50/60 p-4">
          {bar ? (
            <div aria-hidden className="mb-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-ink-200">
              <div className="h-full rounded-l-full bg-brand-700" style={{ width: `${bar.place}%` }} />
              {bar.fee > 0 ? <div className="h-full rounded-r-full bg-brand-300" style={{ width: `${bar.fee}%` }} /> : null}
            </div>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-4 sm:gap-x-6">
            {legend.map((q, i) => (
              <div key={q.label} className={cn("min-w-0", i > 0 && "border-l border-ink-200 pl-4 sm:pl-6")}>
                <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-700">
                  {bar ? <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", q.swatch)} /> : null}
                  {q.label}
                </dt>
                <dd className="nums mt-1 break-words text-lg font-bold leading-tight tabular-nums text-ink-900 sm:text-xl">
                  <Figure parts={q.parts} />
                </dd>
                <p className="mt-1 text-sm text-ink-700">{q.note}</p>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
