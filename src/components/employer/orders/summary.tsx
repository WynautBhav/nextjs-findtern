import { CheckCircle2 } from "lucide-react";

import { CountUp } from "@/components/app/count-up";
import { HeroPanel } from "@/components/employer/kit/hero-panel";
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
          {i > 0 ? <span className="px-1 opacity-70">+</span> : null}
          {formatMoney(p.minor, p.currency, { zeroLabel: false })}
        </span>
      ))}
    </>
  );
}

/** The lead figure counts up once per currency; settled it is the exact amount. */
function LeadFigure({ parts }: { parts: { currency: string; minor: number }[] }) {
  const shown = parts.filter((p) => p.minor > 0);
  const list = shown.length ? shown : [{ currency: parts[0]?.currency ?? "INR", minor: 0 }];
  return (
    <>
      {list.map((p, i) => (
        <span key={p.currency}>
          {i > 0 ? <span className="px-1.5 text-on-dark-subtle">+</span> : null}
          <CountUp value={p.minor / 100} currency={p.currency} />
        </span>
      ))}
    </>
  );
}

/**
 * The band above the list, as a hero: the one big figure (everything paid,
 * hiring fees included, so it is the same number the invoices add up to), a
 * thin bar splitting it into placements and one-time hiring fees, and what is
 * still to pay. The bar is drawn only when every hire bills in one currency,
 * so two currencies are never mixed into one proportion.
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

  const legend: { label: string; parts: { currency: string; minor: number }[]; note?: string; swatch: string }[] = [
    { label: "Placements", parts: placements, swatch: "bg-white" },
    { label: "Hiring fees", parts: fees, swatch: "bg-accent", note: sameFee ? `${feed.length} × ${formatMoney(feed[0].feeMinor, feed[0].currency, { zeroLabel: false })}, one-time` : "One-time, per hire" },
  ];

  return (
    <HeroPanel className="mb-8 p-6 sm:p-7">
      <section aria-label="Payment summary" className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
        <div className="min-w-0">
          <p className="text-sm font-medium text-on-dark">Total paid</p>
          <p className="nums mt-1.5 break-words text-[2.75rem] font-light leading-none tracking-[-0.04em] tabular-nums text-white sm:text-[3.25rem]">
            <LeadFigure parts={paid} />
          </p>
          <p className="mt-2.5 text-sm text-on-dark-subtle">
            Across {hires.length} {hires.length === 1 ? "hire" : "hires"}, hiring fees included
          </p>
          <p
            className={cn(
              "mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium",
              owing ? "bg-accent text-brand-950" : "bg-white/12 text-white ring-1 ring-inset ring-white/25",
            )}
          >
            {owing ? null : <CheckCircle2 className="size-4" aria-hidden />}
            <span>Still to pay</span>
            <span className="nums font-semibold tabular-nums">
              <Figure parts={left} />
            </span>
          </p>
        </div>
        <div className="min-w-0">
          {bar ? (
            <div aria-hidden className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-l-full bg-white" style={{ width: `${bar.place}%` }} />
              {bar.fee > 0 ? <div className="h-full rounded-r-full bg-accent" style={{ width: `${bar.fee}%` }} /> : null}
            </div>
          ) : null}
          <dl className={cn("grid grid-cols-2 gap-x-6", bar ? "mt-4" : "")}>
            {legend.map((q) => (
              <div key={q.label} className="min-w-0">
                <dt className="flex items-center gap-2 whitespace-nowrap text-sm font-medium text-on-dark">
                  {bar ? <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", q.swatch)} /> : null}
                  {q.label}
                </dt>
                <dd className="nums mt-1 text-xl font-medium leading-tight tracking-[-0.01em] tabular-nums text-white sm:text-2xl">
                  <Figure parts={q.parts} />
                </dd>
                {q.note ? <p className="mt-1 text-sm text-on-dark-subtle">{q.note}</p> : null}
              </div>
            ))}
          </dl>
        </div>
      </section>
    </HeroPanel>
  );
}
