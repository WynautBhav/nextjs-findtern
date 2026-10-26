"use client";

import { useState } from "react";

import { formatMoney } from "@/lib/format";
import { CheckoutPay } from "./checkout-pay";

export type SummaryLine = {
  id: string;
  label: string;
  currency: "INR" | "USD";
  /** The whole engagement paid now, after any upfront discount. */
  upfrontMinor: number;
  /** The first month (plus any per-hire fee); null when monthly isn't offered. */
  monthlyMinor: number | null;
  /** Why monthly isn't offered for this line, if it isn't. */
  monthlyBlocked: string | null;
  /** A running monthly placement: only its due month can be paid. */
  due: boolean;
  months: number;
};

type Mode = "upfront" | "monthly";

/**
 * Pay for one hire at a time (legacy checkout): each payment is one accepted
 * offer, so an invoice, a refund or a dispute always maps to exactly one
 * candidate. A new hire is paid month by month by default (bug sheet 22 Oct)
 * where the offer allows it, or upfront for the discount; a monthly placement
 * that is already running pays its due month.
 */
export function CheckoutSummary({
  employerId,
  lines,
  prefill,
  testMode = false,
}: {
  employerId: string;
  testMode?: boolean;
  lines: SummaryLine[];
  prefill: { name?: string; email?: string; contact?: string };
}) {
  const [selectedId, setSelectedId] = useState(lines[0]?.id ?? "");
  const line = lines.find((l) => l.id === selectedId) ?? lines[0];
  const [picked, setPicked] = useState<Mode>("monthly");

  const canMonthly = Boolean(line && line.monthlyMinor != null);
  const mode: Mode = line?.due ? "monthly" : canMonthly ? picked : "upfront";
  const amountOf = (l: SummaryLine, m: Mode) => (l.due || (m === "monthly" && l.monthlyMinor != null) ? (l.monthlyMinor ?? 0) : l.upfrontMinor);
  const amountMinor = line ? amountOf(line, mode) : 0;

  return (
    <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
      {/* min-w-0: a fieldset is min-content wide by default, which pushed the
          amounts out of the 20rem column on long candidate labels. */}
      <fieldset className="min-w-0">
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
                <span className="shrink-0 tabular-nums text-ink-600">{formatMoney(amountOf(l, picked), l.currency, { zeroLabel: false })}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {line && !line.due ? (
        <fieldset className="mt-4 min-w-0 border-t border-ink-100 pt-4">
          <legend className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">How to pay</legend>
          <div className="mt-3 space-y-1">
            <label className={`flex min-h-11 items-center gap-2.5 rounded-[10px] px-2 text-sm text-ink-800 ${canMonthly ? "cursor-pointer hover:bg-ink-50" : "opacity-60"}`}>
              <input
                type="radio"
                name="checkout-mode"
                className="size-4 accent-brand-700"
                checked={mode === "monthly"}
                disabled={!canMonthly}
                onChange={() => setPicked("monthly")}
              />
              <span className="min-w-0 flex-1">
                Monthly
                <span className="block text-xs text-text-subtle">
                  {canMonthly
                    ? line.months > 1
                      ? `First month now, then one payment a month for ${line.months - 1} more`
                      : "One month, paid now"
                    : line.monthlyBlocked}
                </span>
              </span>
              {line.monthlyMinor != null ? (
                <span className="tabular-nums text-ink-600">{formatMoney(line.monthlyMinor, line.currency, { zeroLabel: false })}</span>
              ) : null}
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] px-2 text-sm text-ink-800 hover:bg-ink-50">
              <input
                type="radio"
                name="checkout-mode"
                className="size-4 accent-brand-700"
                checked={mode === "upfront"}
                onChange={() => setPicked("upfront")}
              />
              <span className="min-w-0 flex-1">
                Whole engagement
                <span className="block text-xs text-text-subtle">Paid once, now</span>
              </span>
              <span className="tabular-nums text-ink-600">{formatMoney(line.upfrontMinor, line.currency, { zeroLabel: false })}</span>
            </label>
          </div>
        </fieldset>
      ) : null}

      {line ? (
        <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
          <p className="flex items-baseline justify-between">
            <span className="text-sm text-text-subtle">{mode === "monthly" ? "Due now" : "Total"}</span>
            <span className="text-lg font-semibold tabular-nums text-ink-900">
              {formatMoney(amountMinor, line.currency, { zeroLabel: false })}
            </span>
          </p>
          <CheckoutPay
            key={`${line.id}:${mode}`}
            employerId={employerId}
            currency={line.currency}
            amountMinor={amountMinor}
            prefill={prefill}
            proposalIds={[line.id]}
            mode={mode}
            testMode={testMode}
          />
        </div>
      ) : null}
      <p className="mt-4 text-xs leading-relaxed text-text-subtle">
        One hire per payment. Prices include GST for Indian billing.
      </p>
    </section>
  );
}
