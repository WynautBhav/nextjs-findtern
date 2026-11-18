"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { RollingNumber } from "@/components/app/rolling-number";
import { Section } from "@/components/app/stat";
import { scheduleSummary } from "@/lib/dues-display";
import { promoTotals } from "@/lib/checkout-selection";
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
  /** The list amount of a hiring fee that is waived (free band): shown struck through with (FREE); 0 when none. */
  feeWaivedListMinor: number;
  /** The whole engagement paid now (or the full-time fee). */
  upfrontMinor: number;
  /** A running placement's due month (no fee); null on a new hire. */
  monthlyMinor: number | null;
  /** The hiring charge + Month 1 charge, paid now; months 2+ are due 2 days before the intern's pay day; null when not offered (score below 6, full-time). */
  postpaidMinor: number | null;
  /** YYYY-MM-DD each later month falls due, month 2 first (post-paid; month 1 is paid now). */
  schedule: string[];
  monthlyBlocked: string | null;
  /** A running monthly placement: only its due month can be paid. */
  due: boolean;
  /** Payments already made for this hire (the due month's index). */
  monthsPaid: number;
  /** YYYY-MM-DD the due month falls due. */
  dueOn: string | null;
  months: number;
  fullTimeCtcMinor: number | null;
};

type Mode = "upfront" | "monthly" | "postpaid";

/**
 * Checkout, as one flow: pick the hire on the left, see exactly what is
 * charged on the right, pay. One hire per payment (legacy checkout), so an
 * invoice, a refund or a dispute always maps to one candidate. A new
 * hire (score 6+) pays the hiring charge + Month 1 charge now, then months 2+ as each falls
 * due, by default, or the whole internship now; a running placement pays
 * its due month.
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
  const [picked, setPicked] = useState<Mode>("postpaid");
  // A promo code is for the whole engagement paid upfront: while one is applied, monthly payment is locked.
  // A full-waiver code works on every plan, so it does not lock the plan; the plan picker clears it (the pay box below restarts with the plan).
  const [promo, setPromo] = useState<{ code: string; discountMinor: number; fullWaiver?: boolean } | null>(null);
  const promoApplied = promo !== null && !promo.fullWaiver;

  const canPostpaid = Boolean(line && line.postpaidMinor != null) && !promoApplied;
  const mode: Mode = line?.due ? "monthly" : canPostpaid ? picked : "upfront";
  const amountOf = (l: SummaryLine, m: Mode) =>
    l.due ? (l.monthlyMinor ?? 0) : m === "postpaid" && l.postpaidMinor != null ? l.postpaidMinor : l.upfrontMinor;
  const amountMinor = line ? amountOf(line, mode) : 0;
  const { discountMinor, totalMinor } = promoTotals(amountMinor, promo?.discountMinor ?? 0);
  const m = (minor: number, cur: string) => formatMoney(minor, cur, { zeroLabel: false });
  // The one-time fee row: the amount when charged; struck through with (FREE) when the band is waived.
  const fee = line ? (
    line.feeMinor > 0 ? (
      <Row label="Hiring charge (one-time)">{m(line.feeMinor, line.currency)}</Row>
    ) : line.feeWaivedListMinor > 0 ? (
      <Row label="Hiring charge (one-time)">
        <s className="mr-1.5 font-normal text-ink-600">{m(line.feeWaivedListMinor, line.currency)}</s>
        <span className="font-semibold text-success">(FREE)</span>
      </Row>
    ) : null
  ) : null;

  const asRolling = line && line.currency === "INR" && totalMinor % 100 === 0;

  return (
    <div className="grid gap-x-12 gap-y-10 pb-20 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:pb-0">
      {/* ── What can be paid: a ruled ledger, one hire per row ─────── */}
      <fieldset className="min-w-0">
        <legend className="float-left mb-1 w-full border-b border-ink-200 pb-2 font-display text-lg font-semibold text-ink-900">
          {lines.length === 1 ? "Ready to pay" : `${lines.length} ready to pay`}
          <span className="ml-2 font-sans text-sm font-normal text-ink-600">one hire per payment</span>
        </legend>
        <ul className="clear-left divide-y divide-ink-200 border-b border-ink-200">
          {lines.map((l) => {
            const selected = l.id === line?.id;
            const rowMode = l.id === line?.id ? mode : picked;
            return (
              <li key={l.id}>
                <label
                  className={cn(
                    "grid min-h-11 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 py-5 transition-colors duration-[var(--motion-fast)]",
                    "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-700",
                    selected ? "-mx-3 rounded-lg bg-surface-raised px-3 ring-1 ring-ink-300" : "hover:bg-ink-100/60",
                  )}
                >
                  <input
                    type="radio"
                    name="checkout-line"
                    className="mt-1.5 size-5 shrink-0 accent-brand-800"
                    checked={selected}
                    onChange={() => {
                      setSelectedId(l.id);
                      setPromo(null);
                    }}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="font-display text-lg font-semibold text-ink-900">{l.who}</span>
                      {l.due ? (
                        <Pill tone="waiting">{l.durationLabel}</Pill>
                      ) : l.fullTimeCtcMinor != null ? (
                        <Pill tone="new">Full-time</Pill>
                      ) : (
                        <Pill tone="live">Accepted</Pill>
                      )}
                    </span>
                    <span className="mt-0.5 block break-words text-sm text-ink-700">
                      {l.roleTitle}
                      {l.projectName && l.projectName !== l.roleTitle ? ` · ${l.projectName}` : ""}
                    </span>
                    <span className="nums mt-1 block text-sm text-ink-600">
                      {l.fullTimeCtcMinor != null
                        ? `Annual CTC ${m(l.fullTimeCtcMinor, l.currency)}`
                        : l.due
                          ? l.dueOn
                            ? `Due ${formatDate(l.dueOn)}`
                            : "Next month of a running placement"
                          : `${l.durationLabel}${l.monthlyRateMinor != null ? ` · ${m(l.monthlyRateMinor, l.currency)}/month` : ""}`}
                    </span>
                  </span>
                  <span className="nums text-right">
                    <span className="block font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">{m(amountOf(l, rowMode), l.currency)}</span>
                    <span className="mt-0.5 block max-w-[10rem] text-xs text-ink-600">
                      {l.due ? "this month" : l.fullTimeCtcMinor != null ? "one-time fee" : l.postpaidMinor != null && rowMode === "postpaid" ? "hiring charge + month 1, due now" : "whole internship"}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-ink-700">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
          Amounts are the terms each candidate accepted, recalculated on our side before you pay. You see each candidate&apos;s name once the hire is paid.
        </p>
        <div className="mt-10">
          <Section title="After you pay">
            <ol className="divide-y divide-ink-200 border-b border-ink-200 text-base text-ink-900">
              <li className="py-3">The candidate becomes a hire and their name unlocks.</li>
              <li className="py-3">A tax invoice for this payment is issued under Orders.</li>
            </ol>
          </Section>
        </div>
      </fieldset>

      {/* ── This payment: the statement, sticky on desktop ─────────── */}
      {line ? (
        <section aria-label="Order summary" className="min-w-0 rounded-lg border border-ink-200 bg-surface-raised p-5 sm:p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-semibold text-ink-900">This payment</h2>
          <p className="mt-0.5 truncate text-sm text-ink-700">
            {line.who} · {line.roleTitle}
          </p>
          {!line.due && line.fullTimeCtcMinor == null ? <StageTrail /> : null}

          {!line.due && line.fullTimeCtcMinor == null ? (
            <fieldset className="mt-5 min-w-0 border-t border-ink-200 pt-4">
              <legend className="float-left mb-1 w-full text-sm font-medium text-ink-900">How to pay</legend>
              <div className="clear-left divide-y divide-ink-200">
                <label
                  className={cn(
                    "flex min-h-11 items-start gap-3 py-3 text-sm",
                    canPostpaid ? "cursor-pointer text-ink-900" : "cursor-not-allowed text-ink-700",
                  )}
                >
                  <input
                    type="radio"
                    name="checkout-mode"
                    className="mt-0.5 size-5 shrink-0 accent-brand-800"
                    checked={mode === "postpaid"}
                    disabled={!canPostpaid}
                    onChange={() => {
                      setPicked("postpaid");
                      setPromo(null);
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    {line.postpaidMinor != null ? `${m(line.postpaidMinor, line.currency)} now (hiring charge + Month 1 charge)${line.months > 1 ? ", then each later month's charge due 2 days before the month's pay date" : ""}` : "Each month's charge due 2 days before the month's pay date"}
                    <span className="block text-xs text-ink-600">
                      {promoApplied ? "Not with a promo code" : canPostpaid ? "Recommended" : line.monthlyBlocked}
                    </span>
                  </span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-3 text-sm text-ink-900">
                  <input
                    type="radio"
                    name="checkout-mode"
                    className="mt-0.5 size-5 shrink-0 accent-brand-800"
                    checked={mode === "upfront"}
                    onChange={() => {
                      setPicked("upfront");
                      setPromo(null);
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    Pay the whole internship now
                    <span className="block text-xs text-ink-600">Paid once, now</span>
                  </span>
                  <span className="nums shrink-0 text-ink-700">{m(line.upfrontMinor, line.currency)}</span>
                </label>
              </div>
            </fieldset>
          ) : null}

          <dl className="mt-5 border-t border-ink-200 text-sm">
            <div className="divide-y divide-ink-200">
              {line.fullTimeCtcMinor != null ? (
                <Row label="Hiring fee (8.33% of annual CTC)">{m(line.upfrontMinor, line.currency)}</Row>
              ) : (
                <>
                  {mode === "postpaid" ? (
                    <>
                      {fee}
                      <Row label="Month 1 charge">{m(amountMinor - line.feeMinor, line.currency)}</Row>
                    </>
                  ) : (
                    <>
                      <Row label={line.due ? line.durationLabel : "Monthly charges, whole internship"}>
                        {m(amountMinor - (line.due ? 0 : line.feeMinor), line.currency)}
                      </Row>
                      {!line.due ? fee : null}
                    </>
                  )}
                </>
              )}
              {promo && discountMinor > 0 ? <Row label={`Promo ${promo.code}`}>{`−${m(discountMinor, line.currency)}`}</Row> : null}
              {line.currency === "INR" ? <Row label="GST">included</Row> : null}
            </div>
            {promo?.fullWaiver ? (
              <p role="status" className="mt-3 text-sm font-medium text-success">
                Complimentary (full waiver): nothing is charged, hiring fee included.
              </p>
            ) : null}
            <div className="mt-1 flex items-end justify-between gap-3 border-t border-ink-900 pt-4">
              <dt className="pb-1.5 text-sm font-medium text-ink-900">{mode === "upfront" ? "Total" : "Due now"}</dt>
              <dd className="nums text-signal">
                {asRolling ? (
                  <RollingNumber key={line.id} value={totalMinor / 100} currency="INR" className="font-display text-4xl font-semibold tracking-[-0.03em]" />
                ) : (
                  <span className="font-display text-4xl font-semibold tracking-[-0.03em]">{m(totalMinor, line.currency)}</span>
                )}
              </dd>
            </div>
          </dl>

          {mode === "postpaid" && line.schedule.length > 0 ? (
            <div className="mt-4 text-sm">
              <p className="font-medium text-ink-900">{scheduleSummary(line.schedule, line.monthlyRateMinor, (n) => m(n, line.currency))}</p>
              <p className="mt-0.5 text-xs text-ink-600">Each month is due 2 days before the intern&apos;s pay day. You can pay up to 15 days early.</p>
            </div>
          ) : null}

          <div className="mt-5">
            <CheckoutPay
              key={`${line.id}:${mode}`}
              employerId={employerId}
              currency={line.currency}
              amountMinor={amountMinor}
              prefill={prefill}
              proposalIds={[line.id]}
              mode={mode}
              paymentIndex={line.monthsPaid}
              testMode={testMode}
              onPromoChange={setPromo}
            />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-600">
            {line.currency === "INR" ? "Prices include GST. " : "Billed in US dollars. "}
            {promo?.fullWaiver ? "A full-waiver code covers the hiring fee too." : "The one-time hiring fee is never discounted by an ordinary code."}
          </p>
          <Link href="/employer/orders" className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline underline-offset-4 hover:text-brand-900">
            Past payments
          </Link>
        </section>
      ) : null}
    </div>
  );
}

/** The life of the offer being paid: sent and accepted are behind it, paying hires. Words, not colour alone. */
function StageTrail() {
  const steps = [
    { label: "Sent", done: true },
    { label: "Accepted", done: true },
    { label: "Paid", current: true },
    { label: "Hired" },
  ];
  return (
    <ol aria-label="Offer progress: sent and accepted, payment next, then hired" className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          {i > 0 ? <span aria-hidden className="h-px w-4 bg-ink-300" /> : null}
          <span className={cn("inline-flex items-center gap-1", s.current ? "font-semibold text-signal" : s.done ? "text-ink-700" : "text-ink-600")}>
            {s.done ? <Check className="size-3.5 text-brand-700" aria-hidden /> : <span aria-hidden className={cn("size-1.5 rounded-full", s.current ? "bg-signal" : "bg-ink-300")} />}
            {s.label}
            {s.current ? <span className="sr-only"> (next)</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="text-ink-700">{label}</dt>
      <dd className="nums font-medium text-ink-900">{children}</dd>
    </div>
  );
}
