"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { PageHead } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { tabClass } from "@/components/employer/ui-tokens";
import { paymentsBadge } from "@/lib/dues";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { todayIst } from "@/lib/offer";
import type { HireRow, InvoiceRow } from "./orders/types";
import { HiresPanel } from "./orders/hires-panel";
import { SchedulePanel } from "./orders/schedule-panel";
import { InvoicesPanel } from "./orders/invoices-panel";
import { HeroFigure, HeroPanel } from "./kit/hero-panel";
import { sumLabel } from "./orders/shared";

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

  const paid = sumLabel(hires.map((h) => ({ currency: h.currency, minor: h.ledger.paidMinor })));
  const left = sumLabel(hires.map((h) => ({ currency: h.currency, minor: h.ledger.dueMinor })));
  const today = todayIst();
  const nextDue = hires
    .map((h) => h.ledger.nextDue)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  // One bar only when every hire bills in the same currency; mixing INR and USD would be meaningless.
  const sameCurrency = hires.length > 0 && hires.every((h) => h.currency === hires[0].currency);
  const paidTotal = hires.reduce((n, h) => n + h.ledger.paidMinor, 0);
  const dueTotal = hires.reduce((n, h) => n + h.ledger.dueMinor, 0);
  const paidShare = sameCurrency && paidTotal + dueTotal > 0 ? Math.round((paidTotal / (paidTotal + dueTotal)) * 100) : null;

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
        lede={
          hires.length > 0
            ? offers
              ? `Also: ${offers}.`
              : undefined
            : offers
              ? `No hires yet: ${offers}. The hire starts once you pay.`
              : "No hires yet. A hire, its payments and its invoices land here once you pay for an accepted offer."
        }
        action={
          payableCount + earlyCount > 0 ? (
            <ButtonLink href="/employer/checkout" variant="accent">
              {paymentsBadge(payableCount, earlyCount)}
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          ) : null
        }
      />

      {hires.length > 0 ? (
        <HeroPanel className="mb-7">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end">
            <HeroFigure lead label="Paid so far" value={paid ?? "Nothing yet"} hint={`${hires.length} hire${hires.length === 1 ? "" : "s"} on your account`} />
            <div className="grid grid-cols-2 gap-6">
              <HeroFigure label="Still to pay" value={left ?? "Settled"} hint={left ? "Across your hires" : "Nothing outstanding"} />
              <HeroFigure
                label={nextDue && nextDue < today ? "Overdue since" : "Next instalment"}
                value={nextDue ? formatDate(nextDue) : "None due"}
                hint={nextDue ? undefined : "No instalments pending"}
              />
            </div>
          </div>
          {paidShare !== null ? (
            <div className="mt-7">
              <div role="img" aria-label={`${paidShare}% of hire fees paid`} className="h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-300 to-white motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${paidShare}%` }} />
              </div>
              <p className="nums mt-2 text-xs text-on-dark-subtle">{paidShare}% of hire fees paid</p>
            </div>
          ) : null}
        </HeroPanel>
      ) : null}

      {/* Wraps rather than scrolling behind a hidden scrollbar (QA-131). */}
      <div
        role="tablist"
        aria-label="Orders"
        className="mb-6 flex max-w-full flex-wrap gap-1"
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
            className={tabClass(tab === t.id)}
          >
            {t.short ? (
              <>
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </>
            ) : (
              t.label
            )}
            <span className={cn("nums text-xs", tab === t.id ? "text-white/75" : "text-text-subtle")}>{t.count}</span>
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

