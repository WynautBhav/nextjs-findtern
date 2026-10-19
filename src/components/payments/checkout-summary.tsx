"use client";

import { useState } from "react";

import { formatMoney } from "@/lib/format";
import { CheckoutPay } from "./checkout-pay";

export type SummaryLine = {
  id: string;
  label: string;
  currency: "INR" | "USD";
  /** What paying for this line now costs (upfront, or the due month). */
  amountMinor: number;
};

/**
 * Pay for one hire at a time (legacy checkout): each payment is one accepted
 * offer, so an invoice, a refund or a dispute always maps to exactly one
 * candidate. There is no plan choice: a new hire is paid upfront, and a
 * monthly placement that is already running pays its due month.
 */
export function CheckoutSummary({
  employerId,
  lines,
  prefill,
}: {
  employerId: string;
  lines: SummaryLine[];
  prefill: { name?: string; email?: string; contact?: string };
}) {
  const [selectedId, setSelectedId] = useState(lines[0]?.id ?? "");
  const line = lines.find((l) => l.id === selectedId) ?? lines[0];

  return (
    <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
      <fieldset>
        <legend className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Pay for</legend>
        <ul className="mt-3 space-y-1">
          {lines.map((l) => (
            <li key={l.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] px-2 text-sm text-ink-800 hover:bg-ink-50">
                <input
                  type="radio"
                  name="checkout-line"
                  className="size-4 accent-brand-700"
                  checked={line?.id === l.id}
                  onChange={() => setSelectedId(l.id)}
                />
                <span className="min-w-0 flex-1 truncate">{l.label}</span>
                <span className="tabular-nums text-ink-600">{formatMoney(l.amountMinor, l.currency, { zeroLabel: false })}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {line ? (
        <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
          <p className="flex items-baseline justify-between">
            <span className="text-sm text-text-subtle">Total</span>
            <span className="text-lg font-semibold tabular-nums text-ink-900">
              {formatMoney(line.amountMinor, line.currency, { zeroLabel: false })}
            </span>
          </p>
          <CheckoutPay
            key={line.id}
            employerId={employerId}
            currency={line.currency}
            amountMinor={line.amountMinor}
            prefill={prefill}
            proposalIds={[line.id]}
            mode="upfront"
          />
        </div>
      ) : null}
      <p className="mt-4 text-xs leading-relaxed text-text-subtle">
        One hire per payment. Prices include GST for Indian billing.
      </p>
    </section>
  );
}
