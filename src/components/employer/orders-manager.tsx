"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { PageHead } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { paymentsBadge } from "@/lib/dues";
import { cn } from "@/lib/utils";
import { HiresPanel } from "./orders/hires-panel";
import { InvoicesPanel } from "./orders/invoices-panel";
import { SchedulePanel } from "./orders/schedule-panel";
import { OrdersSummary } from "./orders/summary";
import type { HireRow, InvoiceRow } from "./orders/types";

export type { HireRow, InvoiceRow };

type Tab = "hires" | "schedule" | "invoices";

export function OrdersManager({
  employerId,
  fteStatus,
  timezone,
  hires,
  invoices,
  payableCount,
  earlyCount,
  offersToPay,
  payableIds,
}: {
  employerId: string;
  fteStatus: string;
  timezone: string;
  hires: HireRow[];
  invoices: InvoiceRow[];
  /** Accepted offers and months whose due day has come, waiting at checkout. */
  payableCount: number;
  /** Months still inside their pay window: payable now, not due yet. */
  earlyCount: number;
  /** Of those, accepted offers not yet paid for (not hires, so not in the hire figures). */
  offersToPay: number;
  /** Proposals checkout can bill right now: a hire's Pay links only to these (QA-139). */
  payableIds: string[];
}) {
  const [tab, setTab] = useState<Tab>("hires");

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "hires", label: "Hires", count: hires.length },
    { id: "schedule", label: "Payments", count: hires.length },
    { id: "invoices", label: "Invoices", count: invoices.length },
  ];

  // Accepted offers are not hires yet, so the hire figures leave them out;
  // name them here so "N payments due" never sits beside a clean slate (QA-007).
  const offers = offersToPay > 0 ? `${offersToPay} accepted offer${offersToPay === 1 ? "" : "s"} to pay for` : "";

  const hasPay = payableCount + earlyCount > 0;

  return (
    <div className="pb-20 lg:pb-0">
      <PageHead
        title="Orders"
        // The money is in the summary below; the line says only what it does not.
        lede={hires.length === 0 && offers ? `${offers}. A hire starts once you pay.` : "Your hires, what you owe on each, and every invoice."}
        className="mb-8"
        action={
          hasPay ? (
            <ButtonLink href="/employer/checkout" variant="primary" size="md">
              {paymentsBadge(payableCount, earlyCount)}
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          ) : null
        }
      />

      {hires.length > 0 ? <OrdersSummary hires={hires} /> : null}

      {/* Tabs on a hairline: the active one is underlined. A count is shown only when there is something to count. */}
      <div
        role="tablist"
        aria-label="Orders"
        className="mb-6 flex gap-6 overflow-x-auto border-b border-ink-200"
        onKeyDown={(e) => {
          // APG tabs: arrows, Home and End move between tabs; Tab leaves the list.
          const i = tabs.findIndex((t) => t.id === tab);
          const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
          if (to === undefined) return;
          e.preventDefault();
          const next = tabs[(to + tabs.length) % tabs.length].id;
          setTab(next);
          document.getElementById(`orders-tab-${next}`)?.focus();
        }}
      >
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`orders-tab-${t.id}`}
              tabIndex={on ? 0 : -1}
              aria-selected={on}
              aria-controls={on ? `orders-panel-${t.id}` : undefined}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-0.5 text-base font-medium outline-none transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700",
                on ? "border-brand-800 font-semibold text-ink-900" : "border-transparent text-ink-700 hover:text-ink-900",
              )}
            >
              {t.label}
              {t.count > 0 ? <span className="nums text-sm font-normal text-ink-600">{t.count}</span> : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`orders-panel-${tab}`} aria-labelledby={`orders-tab-${tab}`}>
        {tab === "hires" ? (
          <HiresPanel hires={hires} employerId={employerId} fteStatus={fteStatus} timezone={timezone} payableIds={payableIds} emptyPrimary={!hasPay} />
        ) : tab === "schedule" ? (
          <SchedulePanel hires={hires} payableIds={payableIds} emptyPrimary={!hasPay} />
        ) : (
          <InvoicesPanel invoices={invoices} emptyPrimary={!hasPay} />
        )}
      </div>
    </div>
  );
}
