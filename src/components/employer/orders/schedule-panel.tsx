"use client";

import { useMemo, useState } from "react";
import { CalendarCheck } from "lucide-react";

import { Pill, Surface, type Tone } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { tdClass, thClass } from "@/components/employer/ui-tokens";
import { formatDate, formatMoney } from "@/lib/format";
import { payButtonState } from "@/lib/dues-display";
import { filterHires } from "@/lib/orders-filter";
import { todayIst } from "@/lib/offer";
import { cn } from "@/lib/utils";
import type { HireRow } from "./types";
import { OrdersEmpty } from "./empty";
import { LiveCount, ResetButton, SearchField, STATUS, TOOLBAR_CARD } from "./shared";

const payHref = (h: HireRow) => `/employer/checkout?proposal=${encodeURIComponent(h.proposalId)}`;

/* ── Payment schedule (legacy "Upcoming payments") ──────────────────── */

type ScheduleFilter = "all" | "partially_paid" | "fully_paid";

export function SchedulePanel({ hires, payableIds }: { hires: HireRow[]; payableIds: string[] }) {
  const today = todayIst();
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => filterHires(hires, q).filter((h) => filter === "all" || h.ledger.status === filter), [hires, q, filter]);

  if (hires.length === 0) {
    return (
      <OrdersEmpty
        icon={<CalendarCheck />}
        title="No payments yet"
        body="Each hire's total, what you've paid and the next instalment date appear here once a placement starts."
        hint="Next: complete a hire"
        next={{ label: "Your proposals", href: "/employer/proposals" }}
      />
    );
  }

  return (
    <div>
      <div className={TOOLBAR_CARD}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end lg:grid-cols-[minmax(0,1.6fr)_auto]">
        <SearchField value={q} onChange={setQ} placeholder="Candidate, project or role" />
        <ResetButton
          enabled={Boolean(q) || filter !== "all"}
          onClick={() => {
            setQ("");
            setFilter("all");
          }}
        />
        <LiveCount active={Boolean(q.trim()) || filter !== "all"} shown={rows.length} total={hires.length} noun="hires" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by payment state">
        {(
          [
            ["all", "All"],
            ["partially_paid", "Partly paid"],
            ["fully_paid", "Fully paid"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={cn(
              "apple-spring min-h-9 rounded-full border px-3.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
              filter === id ? "border-brand-200 bg-brand-100 font-semibold text-brand-900" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      </div>

      {rows.length === 0 ? (
        <OrdersEmpty
          compact
          title={q.trim() ? "No hire matches" : "Nothing here"}
          body={
            q.trim() && filter !== "all"
              ? "No hire matches this search and payment state. Try another name or reset the filters."
              : q.trim()
                ? "Try another candidate, project or role, or reset the search."
                : filter === "partially_paid"
                  ? "No hire is partly paid right now. Choose another payment state or reset."
                  : "No hire is fully paid yet. Choose another payment state or reset."
          }
        />
      ) : (
        /* Below lg each hire stacks into labelled lines ([data-stack], globals.css); the wide table only from lg. */
        <Surface data-stack tabIndex={0} role="region" aria-label="Hires and payments" className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
          <table className="w-full border-collapse lg:min-w-[42rem]">
            <thead className="border-b border-ink-100 bg-ink-50/60">
              <tr>
                <th scope="col" className={thClass}>Candidate</th>
                <th scope="col" className={cn(thClass, "text-right")}>Total</th>
                <th scope="col" className={cn(thClass, "text-right")}>Paid</th>
                <th scope="col" className={cn(thClass, "text-right")}>Left</th>
                <th scope="col" className={thClass}>Paid on</th>
                <th scope="col" className={thClass}>Next due</th>
                <th scope="col" className={cn(thClass, "text-right lg:sticky lg:right-0 lg:bg-ink-50 lg:shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.12)]")}>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((h) => {
                // "Overdue" is the first thing a skimming eye needs, so it leads the row, not the 7th line.
                const overdue = Boolean(h.ledger.nextDue) && (h.ledger.nextDue as string) < today && h.ledger.dueMinor > 0;
                const s = overdue ? { label: "Overdue", tone: "waiting" as Tone } : STATUS[h.ledger.status];
                const m = (minor: number) => formatMoney(minor, h.currency, { zeroLabel: false });
                const pay = payButtonState(h.ledger, payableIds, today);
                return (
                  <tr key={h.proposalId}>
                    <td data-title className={tdClass}>
                      <div className="min-w-0 [overflow-wrap:anywhere]">
                        <p className="font-medium text-ink-900">{h.candidateName}</p>
                        <p className="text-sm text-ink-600">{h.projectName}</p>
                        <Pill tone={s.tone} className={cn("mt-1.5", overdue && "bg-danger-soft text-danger ring-danger/25")}>{s.label}</Pill>
                      </div>
                    </td>
                    <td data-label="Total" className={cn(tdClass, "nums text-right font-medium text-ink-900")}>{m(h.ledger.totalMinor)}</td>
                    <td data-label="Paid" data-empty={h.ledger.paidMinor > 0 ? undefined : ""} className={cn(tdClass, "nums text-right")}>{h.ledger.paidMinor > 0 ? m(h.ledger.paidMinor) : "-"}</td>
                    <td data-label="Left" data-empty={h.ledger.dueMinor > 0 ? undefined : ""} className={cn(tdClass, "nums text-right font-semibold", h.ledger.dueMinor > 0 ? "text-ink-900" : "text-text-subtle")}>
                      {h.ledger.dueMinor > 0 ? m(h.ledger.dueMinor) : "-"}
                    </td>
                    <td data-label="Paid on" data-empty={h.ledger.paidOn.length ? undefined : ""} className={cn(tdClass, "nums")}>
                      {h.ledger.paidOn.length ? (
                        <ul className="space-y-0.5">
                          {h.ledger.paidOn.map((d, i) => (
                            <li key={`${d}-${i}`}>{formatDate(d)}</li>
                          ))}
                        </ul>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td data-label="Next due" data-empty={h.ledger.nextDue ? undefined : ""} className={cn(tdClass, "nums")}>
                      {h.ledger.nextDue ? (
                        <div>
                          {h.ledger.nextDue < today ? (
                            <>
                              <span className="font-medium text-danger">Overdue since {formatDate(h.ledger.nextDue)}</span>
                            </>
                          ) : h.ledger.plan === "postpaid" ? (
                            h.ledger.nextDue === today ? <span className="font-medium">Due now</span> : `Due on ${formatDate(h.ledger.nextDue)}`
                          ) : (
                            formatDate(h.ledger.nextDue)
                          )}
                          <span className="block text-xs text-text-subtle">
                            Month {h.ledger.monthsPaid + 1} of {h.ledger.months}
                          </span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className={cn(tdClass, "text-right lg:sticky lg:right-0 lg:bg-white lg:shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.12)]")}>
                      {pay.show ? (
                        pay.enabled ? (
                          <ButtonLink href={payHref(h)} size="sm">
                            {pay.label}
                          </ButtonLink>
                        ) : (
                          <div className="inline-flex flex-col items-end gap-1">
                            <button type="button" disabled aria-describedby={`pay-hint-${h.proposalId}`} className={buttonClass({ size: "sm" })}>
                              {pay.label}
                            </button>
                            <span id={`pay-hint-${h.proposalId}`} className="text-xs text-text-subtle">
                              {pay.payableFrom ? `Payable from ${formatDate(pay.payableFrom)}` : "Not payable online yet"}
                            </span>
                          </div>
                        )
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Surface>
      )}
    </div>
  );
}
