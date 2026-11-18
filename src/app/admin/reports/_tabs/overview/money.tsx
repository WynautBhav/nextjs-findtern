import { Section } from "@/components/app/stat";
import { BarTrend } from "@/components/admin/money/rp-bars";
import { LoadNote, windowWords } from "@/components/admin/money/rp-parts";
import { loadCollected, loadReceiptBuckets } from "@/lib/admin/receivables-load";
import { monthLabel, previousWindow } from "@/lib/admin/reports-shape";
import { reportHref } from "@/lib/admin/reports/href";
import { istMonthKeys } from "@/lib/admin/revenue";
import { formatMoney } from "@/lib/format";

import { changeSentence } from "./growth";
import type { TabProps } from "../types";

const inr = (m: number) => formatMoney(m, "INR", { zeroLabel: "₹0" });

/**
 * Money in, once: what was collected in the period (one definition, lib/admin/receivables-load), against the period before,
 * and the last six India months of it. The Finance tab has the split by employer, intern and college.
 */
export default async function Money({ window: w, params }: TabProps) {
  let data: { total: number; prev: number | null; months: { key: string; value: number }[] } | null = null;
  try {
    const keys = istMonthKeys(new Date(), 6);
    const prevWindow = previousWindow({ since: w.since ?? null, until: w.until });
    const [now, buckets, before] = await Promise.all([loadCollected({ since: w.since, until: w.until }), loadReceiptBuckets("month", 6), prevWindow ? loadCollected(prevWindow) : Promise.resolve(null)]);
    data = { total: now.receivedMinor, prev: before ? before.receivedMinor : null, months: keys.map((k) => ({ key: k, value: buckets.get(k)?.totalMinor ?? 0 })) };
  } catch (error) {
    console.error("[admin/reports/money] load failed", error);
  }
  const label = windowWords(w);
  return (
    <Section title="Money in" hint="Paid employer orders, intern activation fees and college seats, in rupees (dollars at ₹100 per $1), gross of refunds.">
      {data ? (
        <div className="space-y-6">
          <div className="border-b border-ink-200 pb-4">
            <p className="nums font-display text-2xl font-semibold text-ink-900">{inr(data.total)}</p>
            <p className="mt-1 text-sm text-ink-700">
              Collected {label}. {data.prev === null ? "" : changeSentence(data.total, data.prev)}
            </p>
          </div>
          <BarTrend
            ariaLabel="Rupees collected per month"
            bucket="month"
            unit="collected in a month"
            valueHeader="Collected"
            format={(n) => formatMoney(n, "INR", { short: true, zeroLabel: "₹0" })}
            rows={data.months.map((m) => ({ key: m.key, label: monthLabel(m.key), value: m.value, display: inr(m.value) }))}
            lastIsPartial
            emptyText="Nothing has been collected in the last six months. Orders appear here when an employer pays for a hire."
          />
          <p className="text-sm text-ink-600">The six months always end this month, whatever period is picked above.</p>
        </div>
      ) : (
        <LoadNote what="the money figures" retryHref={reportHref(params, {})} />
      )}
    </Section>
  );
}
