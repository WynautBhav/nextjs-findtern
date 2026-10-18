"use client";

import { useMemo, useState } from "react";

import { formatMoney } from "@/lib/format";
import { CheckoutPay } from "./checkout-pay";

export type SummaryLine = {
  id: string;
  label: string;
  currency: "INR" | "USD";
  upfrontMinor: number;
  monthlyMinor: number;
  monthlyBlocked: string | null;
};

/** Pick which accepted offers to pay for now, and upfront or monthly. */
export function CheckoutSummary({
  employerId,
  lines,
  prefill,
}: {
  employerId: string;
  lines: SummaryLine[];
  prefill: { name?: string; email?: string; contact?: string };
}) {
  const [selected, setSelected] = useState(() => new Set(lines.map((l) => l.id)));
  const [mode, setMode] = useState<"upfront" | "monthly">("upfront");
  const chosen = lines.filter((l) => selected.has(l.id));
  const monthlyOk = chosen.length > 0 && chosen.every((l) => !l.monthlyBlocked);
  const effectiveMode = monthlyOk ? mode : "upfront";

  const byCurrency = useMemo(() => {
    const m = new Map<"INR" | "USD", { total: number; ids: string[] }>();
    for (const l of chosen) {
      const e = m.get(l.currency) ?? { total: 0, ids: [] };
      e.total += effectiveMode === "monthly" ? l.monthlyMinor : l.upfrontMinor;
      e.ids.push(l.id);
      m.set(l.currency, e);
    }
    return m;
  }, [chosen, effectiveMode]);

  return (
    <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Pay for</p>
      <ul className="mt-3 space-y-2">
        {lines.map((l) => (
          <li key={l.id}>
            <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-ink-800">
              <input
                type="checkbox"
                className="size-4 accent-brand-700"
                checked={selected.has(l.id)}
                onChange={(e) =>
                  setSelected((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(l.id);
                    else n.delete(l.id);
                    return n;
                  })
                }
              />
              <span className="min-w-0 flex-1 truncate">{l.label}</span>
              <span className="tabular-nums text-ink-600">
                {formatMoney(effectiveMode === "monthly" ? l.monthlyMinor : l.upfrontMinor, l.currency, { zeroLabel: false })}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <fieldset className="mt-4 border-t border-ink-100 pt-4">
        <legend className="sr-only">Payment plan</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["upfront", "monthly"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={effectiveMode === m}
              disabled={m === "monthly" && !monthlyOk}
              onClick={() => setMode(m)}
              className={`min-h-10 rounded-[10px] border px-3 text-xs font-semibold disabled:opacity-40 ${
                effectiveMode === m ? "border-brand-600 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-700 hover:bg-ink-50"
              }`}
            >
              {m === "upfront" ? "Pay upfront" : "Pay monthly"}
            </button>
          ))}
        </div>
        {!monthlyOk && chosen.length > 0 ? (
          <p className="mt-2 text-xs text-text-subtle">{chosen.find((l) => l.monthlyBlocked)?.monthlyBlocked}</p>
        ) : null}
      </fieldset>

      <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
        {byCurrency.size === 0 ? <p className="text-sm text-text-subtle">Select at least one offer.</p> : null}
        {[...byCurrency.entries()].map(([code, { total, ids }]) => (
          <div key={code}>
            <p className="flex items-baseline justify-between">
              <span className="text-sm text-text-subtle">{effectiveMode === "monthly" ? "This month" : "Total"} ({code})</span>
              <span className="text-lg font-semibold tabular-nums text-ink-900">{formatMoney(total, code, { zeroLabel: false })}</span>
            </p>
            <CheckoutPay
              key={`${code}-${effectiveMode}-${ids.join(",")}`}
              employerId={employerId}
              currency={code}
              amountMinor={total}
              prefill={prefill}
              proposalIds={ids}
              mode={effectiveMode}
            />
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-text-subtle">Each currency is paid as its own order. Prices include GST for Indian billing.</p>
    </section>
  );
}
