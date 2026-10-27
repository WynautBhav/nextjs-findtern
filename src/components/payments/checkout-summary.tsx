"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Pill, Surface } from "@/components/app/primitives";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CheckoutPay } from "./checkout-pay";

export type SummaryLine = {
  id: string;
  internId: string;
  /** Initials before hire, the name after. */
  who: string;
  roleTitle: string;
  projectName: string | null;
  currency: "INR" | "USD";
  /** "3 months", "Month 2 of 3" or "Full-time role". */
  durationLabel: string;
  monthlyRateMinor: number | null;
  /** One-time hiring fee inside the upfront figure (0 on a later month). */
  feeMinor: number;
  /** The whole engagement paid now (or the full-time fee). */
  upfrontMinor: number;
  /** First month incl. any fee; null when monthly isn't offered. */
  monthlyMinor: number | null;
  monthlyBlocked: string | null;
  /** A running monthly placement: only its due month can be paid. */
  due: boolean;
  /** YYYY-MM-DD the due month falls due. */
  dueOn: string | null;
  months: number;
  fullTimeCtcMinor: number | null;
};

type Mode = "upfront" | "monthly";

/**
 * Checkout, as one flow: pick the hire on the left, see exactly what is
 * charged on the right, pay. One hire per payment (legacy checkout), so an
 * invoice, a refund or a dispute always maps to one candidate. A new hire is
 * paid month by month by default where the offer allows it (bug sheet
 * 22 Oct), or all upfront; a running monthly placement pays its due month.
 */
export function CheckoutSummary({
  employerId,
  lines,
  prefill,
  initialId,
  testMode = false,
}: {
  employerId: string;
  testMode?: boolean;
  lines: SummaryLine[];
  prefill: { name?: string; email?: string; contact?: string };
  /** Preselected line (?proposal=). */
  initialId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState(lines.find((l) => l.id === initialId)?.id ?? lines[0]?.id ?? "");
  const line = lines.find((l) => l.id === selectedId) ?? lines[0];
  const [picked, setPicked] = useState<Mode>("monthly");

  const canMonthly = Boolean(line && line.monthlyMinor != null);
  const mode: Mode = line?.due ? "monthly" : canMonthly ? picked : "upfront";
  const amountOf = (l: SummaryLine, m: Mode) =>
    l.due || (m === "monthly" && l.monthlyMinor != null) ? (l.monthlyMinor ?? 0) : l.upfrontMinor;
  const amountMinor = line ? amountOf(line, mode) : 0;
  const m = (minor: number, cur: string) => formatMoney(minor, cur, { zeroLabel: false });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      {/* ── What can be paid ───────────────────────────────────────── */}
      <fieldset className="min-w-0">
        <legend className="mb-3 text-base font-semibold text-ink-900">
          {lines.length === 1 ? "Ready to pay" : `${lines.length} ready to pay`}
          <span className="ml-2 text-sm font-normal text-ink-600">one hire per payment</span>
        </legend>
        <ul className="space-y-3">
          {lines.map((l) => {
            const selected = l.id === line?.id;
            return (
              <li key={l.id}>
                <label
                  className={cn(
                    "apple-spring flex cursor-pointer gap-4 rounded-apple-xl border bg-white p-5 shadow-xs",
                    "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-brand-600/30",
                    selected ? "border-brand-600 ring-1 ring-brand-600" : "border-ink-200/80 hover:border-brand-300",
                  )}
                >
                  <input
                    type="radio"
                    name="checkout-line"
                    className="mt-1 size-4 shrink-0 accent-brand-700"
                    checked={selected}
                    onChange={() => setSelectedId(l.id)}
                  />
                  <span className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[0.9375rem] font-semibold text-ink-900">{l.who}</span>
                        {l.due ? (
                          <Pill tone="waiting">{l.durationLabel}</Pill>
                        ) : l.fullTimeCtcMinor != null ? (
                          <Pill tone="new">Full-time</Pill>
                        ) : (
                          <Pill tone="live">Accepted</Pill>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-ink-600">
                        {l.roleTitle}
                        {l.projectName && l.projectName !== l.roleTitle ? ` · ${l.projectName}` : ""}
                      </span>
                      <span className="nums mt-1.5 block text-sm text-ink-600">
                        {l.fullTimeCtcMinor != null
                          ? `Annual CTC ${m(l.fullTimeCtcMinor, l.currency)}`
                          : l.due
                            ? l.dueOn
                              ? `Due ${formatDate(l.dueOn)}`
                              : "Next month of a running placement"
                            : `${l.durationLabel}${l.monthlyRateMinor != null ? ` · ${m(l.monthlyRateMinor, l.currency)}/month` : ""}`}
                      </span>
                    </span>
                    <span className="nums text-left sm:text-right">
                      <span className="block text-lg font-semibold text-ink-900">{m(amountOf(l, picked), l.currency)}</span>
                      <span className="block text-xs text-ink-500">
                        {l.due ? "this month" : l.fullTimeCtcMinor != null ? "one-time fee" : picked === "monthly" && l.monthlyMinor != null ? "first month" : "whole engagement"}
                      </span>
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-ink-600">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
          Amounts are the terms each candidate accepted, recalculated on our side before you pay. Names unlock once the hire is paid.
        </p>
      </fieldset>

      {/* ── Order summary (sticky) ─────────────────────────────────── */}
      {line ? (
        <Surface as="section" aria-label="Order summary" className="p-5 lg:sticky lg:top-24">
          <h2 className="text-base font-semibold text-ink-900">Order summary</h2>
          <p className="mt-0.5 truncate text-sm text-ink-600">
            {line.who} · {line.roleTitle}
          </p>

          {!line.due && line.fullTimeCtcMinor == null ? (
            <fieldset className="mt-4 min-w-0 border-t border-ink-100 pt-4">
              <legend className="float-left mb-2 w-full text-sm font-medium text-ink-800">How to pay</legend>
              <div className="clear-left space-y-1">
                <label
                  className={cn(
                    "flex min-h-11 items-center gap-2.5 rounded-apple-sm px-2 text-sm text-ink-800",
                    canMonthly ? "cursor-pointer hover:bg-ink-50" : "opacity-60",
                  )}
                >
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
                    <span className="block text-xs text-ink-500">
                      {canMonthly
                        ? line.months > 1
                          ? `First month now, then ${line.months - 1} more monthly`
                          : "One month, paid now"
                        : line.monthlyBlocked}
                    </span>
                  </span>
                  {line.monthlyMinor != null ? <span className="nums text-ink-700">{m(line.monthlyMinor, line.currency)}</span> : null}
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-apple-sm px-2 text-sm text-ink-800 hover:bg-ink-50">
                  <input
                    type="radio"
                    name="checkout-mode"
                    className="size-4 accent-brand-700"
                    checked={mode === "upfront"}
                    onChange={() => setPicked("upfront")}
                  />
                  <span className="min-w-0 flex-1">
                    Whole engagement
                    <span className="block text-xs text-ink-500">Paid once, now</span>
                  </span>
                  <span className="nums text-ink-700">{m(line.upfrontMinor, line.currency)}</span>
                </label>
              </div>
            </fieldset>
          ) : null}

          <dl className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-sm">
            {line.fullTimeCtcMinor != null ? (
              <Row label="Hiring fee (8.33% of annual CTC)">{m(line.upfrontMinor, line.currency)}</Row>
            ) : (
              <>
                <Row label={mode === "monthly" ? (line.due ? line.durationLabel : "First month") : "Engagement"}>
                  {m(amountMinor - (line.due ? 0 : line.feeMinor), line.currency)}
                </Row>
                {!line.due && line.feeMinor > 0 ? <Row label="Hiring fee (one-time)">{m(line.feeMinor, line.currency)}</Row> : null}
              </>
            )}
            <div className="flex items-baseline justify-between gap-3 border-t border-ink-100 pt-3">
              <dt className="text-sm font-medium text-ink-800">{mode === "monthly" ? "Due now" : "Total"}</dt>
              <dd className="nums text-2xl font-semibold tracking-[-0.02em] text-ink-900">{m(amountMinor, line.currency)}</dd>
            </div>
          </dl>

          <div className="mt-4">
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
          <p className="mt-4 text-xs leading-relaxed text-ink-500">
            {line.currency === "INR" ? "Prices include GST. " : "Billed in US dollars. "}
            The one-time hiring fee is never discounted.{" "}
            <Link href="/employer/orders" className="font-medium text-brand-700 underline-offset-4 hover:underline">
              Past payments
            </Link>
          </p>
        </Surface>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-600">{label}</dt>
      <dd className="nums font-medium text-ink-900">{children}</dd>
    </div>
  );
}
