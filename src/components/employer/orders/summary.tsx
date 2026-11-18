import { RollingNumber } from "@/components/app/rolling-number";
import { LeadStat, Overview, StatList } from "@/components/app/stat";
import { formatMoney } from "@/lib/format";
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
 * The top of the ledger: one lead figure (everything paid, hiring fees included, so it is the number the invoices add
 * up to) with a proportional bar splitting it into placements and one-time hiring fees, and a ruled list beside it
 * (placements, hiring fees, still to pay). The bar is drawn only when every hire bills in one currency, so two
 * currencies are never mixed into one proportion; the rolling digits only for a single whole-rupee total.
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
  const single = paid.length === 1 && totalMinor > 0;
  const bar = single ? { fee: (feeMinor / totalMinor) * 100, place: ((totalMinor - feeMinor) / totalMinor) * 100 } : null;
  const rolling = single && paid[0].currency === "INR" && totalMinor % 100 === 0;

  const lead = (
    <div>
      <LeadStat
        label="Paid to hire so far"
        tone="brand"
        value={rolling ? <RollingNumber value={totalMinor / 100} currency="INR" /> : <Figure parts={paid} />}
        note="Hiring fees included."
      />
      {bar ? (
        <div className="mt-6 max-w-sm">
          <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-md bg-ink-200">
            <div className="h-full bg-brand-800" style={{ width: `${bar.place}%` }} />
            {bar.fee > 0 ? <div className="h-full bg-brand-300" style={{ width: `${bar.fee}%` }} /> : null}
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-ink-600">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-sm bg-brand-800" />
              Placements
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-sm bg-brand-300" />
              Hiring fees
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );

  return (
    <section aria-label="Payment summary" className="mb-10">
      <Overview
        lead={lead}
        rest={
          <StatList
            items={[
              { label: "Placements", hint: `Across ${hires.length} ${hires.length === 1 ? "hire" : "hires"}`, value: <Figure parts={placements} /> },
              { label: "Hiring fees", hint: sameFee ? `${feed.length} × ${formatMoney(feed[0].feeMinor, feed[0].currency, { zeroLabel: false })}, one-time` : "One-time, per hire", value: <Figure parts={fees} /> },
              {
                label: "Still to pay",
                value: (
                  <span className={owing ? "text-signal" : "text-ink-600"}>
                    <Figure parts={left} />
                  </span>
                ),
              },
            ]}
          />
        }
      />
    </section>
  );
}
