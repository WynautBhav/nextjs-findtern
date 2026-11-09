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
import { sumLabel } from "./orders/shared";
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

  const tabs: { id: Tab; label: string; short?: string; count: number }[] = [
    { id: "hires", label: "Hires", count: hires.length },
    { id: "schedule", label: "Payment schedule", short: "Schedule", count: hires.length },
    { id: "invoices", label: "Invoices", count: invoices.length },
  ];

  // Accepted offers are not hires yet, so the hire figures leave them out;
  // name them here so "N payments due" never sits beside a clean slate (QA-007).
  const offers = offersToPay > 0 ? `${offersToPay} accepted offer${offersToPay === 1 ? "" : "s"} to pay for` : "";

  return (
    <div>
      <PageHead
        title="Orders & payments"
        // The money is in the summary band below; the line says only what it does not.
        lede={
          hires.length > 0
            ? `${hires.length} hire${hires.length === 1 ? "" : "s"}${sumLabel(hires.map((h) => ({ currency: h.currency, minor: h.ledger.dueMinor }))) ? "" : " · nothing left to pay"}`
            : offers
              ? `No hires yet: ${offers}. The hire starts once you pay.`
              : "No hires yet. A hire, its payments and its invoices land here once you pay for an accepted offer."
        }
        action={
          payableCount + earlyCount > 0 ? (
            <ButtonLink href="/employer/checkout" variant="primary">
              {paymentsBadge(payableCount, earlyCount)}
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          ) : null
        }
      />

      {hires.length > 0 ? <OrdersSummary hires={hires} /> : null}

      {/* Wraps rather than scrolling behind a hidden scrollbar (QA-131). */}
      <div
        role="tablist"
        aria-label="Orders"
        className="mb-6 flex flex-wrap gap-x-3 border-b border-ink-200 sm:gap-x-7"
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
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`orders-tab-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            aria-selected={tab === t.id}
            aria-controls={tab === t.id ? `orders-panel-${t.id}` : undefined}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative -mb-px inline-flex min-h-12 min-w-11 items-center justify-center gap-1 whitespace-nowrap text-sm outline-none transition-colors sm:gap-1.5",
              "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:content-['']",
              "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent",
              tab === t.id ? "font-semibold text-ink-900 after:bg-brand-700" : "font-medium text-ink-700 hover:text-ink-900",
            )}
          >
            {t.short ? (
              <>
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </>
            ) : (
              t.label
            )}
            <span className={cn("nums", tab === t.id ? "text-ink-900" : "text-ink-600")}>{t.count}</span>
          </button>
        ))}
      </div>

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
