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

  return (
    <div>
      <PageHead
        title="Orders"
        // The money is in the summary card below; the line says only what it does not.
        lede={hires.length === 0 && offers ? `${offers}. A hire starts once you pay.` : "Your hires, what you owe on each, and every invoice."}
        className="mb-3 sm:mb-4 lg:mb-5 [&_h1]:text-[32px] [&_h1]:leading-10"
        action={
          payableCount + earlyCount > 0 ? (
            <ButtonLink href="/employer/checkout" variant="primary">
              {paymentsBadge(payableCount, earlyCount)}
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          ) : null
        }
      />

      {/* The same green strip with a white selected step as Candidates and Compare. */}
      <div
        role="tablist"
        aria-label="Orders"
        className="mb-4 grid grid-cols-3 items-stretch gap-1 rounded-xl border border-brand-200 bg-brand-100/60 p-1 text-[13px] sm:mb-5 sm:text-sm"
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
                "apple-spring inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:min-h-10 sm:gap-2 sm:px-4 sm:touch:min-h-11",
                on ? "bg-white font-bold text-brand-900 shadow-sm ring-1 ring-brand-200" : "font-medium text-ink-700 hover:bg-white/60 hover:text-ink-900",
              )}
            >
              {t.label}
              <span className={cn("nums min-w-5 rounded-full px-1.5 py-px text-center text-xs font-bold", on ? "bg-brand-700 text-white" : "bg-white text-ink-700 ring-1 ring-brand-200")}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {hires.length > 0 ? <OrdersSummary hires={hires} /> : null}

      <div role="tabpanel" id={`orders-panel-${tab}`} aria-labelledby={`orders-tab-${tab}`}>
        {tab === "hires" ? (
          <HiresPanel hires={hires} employerId={employerId} fteStatus={fteStatus} timezone={timezone} payableIds={payableIds} />
        ) : tab === "schedule" ? (
          <SchedulePanel hires={hires} payableIds={payableIds} />
        ) : (
          <InvoicesPanel invoices={invoices} />
        )}
      </div>
    </div>
  );
}
