"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CalendarCheck, CreditCard, Download, Eye, FileText, RotateCcw, Search } from "lucide-react";

import { EmptyScene, PageHead, Pill, Surface, type Tone } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FullTimeOfferButton } from "@/components/employer/full-time-offer-button";
import { RowMenu } from "@/components/app/row-menu";
import { fieldClass, labelClass, tabClass, tdClass, thClass } from "@/components/employer/ui-tokens";
import { downloadCsv } from "@/lib/admin/csv";
import { paymentsBadge, type PlacementLedger } from "@/lib/dues";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadInvoice } from "@/lib/invoice";
import { filterHires, matchesQuery } from "@/lib/orders-filter";
import { cn } from "@/lib/utils";
import { DmyDateInput } from "@/components/app/dmy-date-input";
import { todayIst } from "@/lib/offer";

export type HireRow = {
  proposalId: string;
  internId: string;
  candidateName: string;
  candidateEmail?: string | null;
  projectName: string;
  roleTitle: string;
  fullTime: boolean;
  annualCtcMinor: number | null;
  /** Minor units of `currency`; null when the offer has none. */
  monthlyMinor: number | null;
  currency: "INR" | "USD";
  months: number;
  startDate: string | null;
  ledger: PlacementLedger;
  /** A paid internship that can still get a full-time offer. */
  canOfferFullTime: boolean;
};

export type InvoiceRow = {
  id: string;
  /** What the customer knows it by: FT/… or a legacy DDMMYY-NN. */
  number: string;
  orderId: string;
  paymentId: string | null;
  paidAt: string | null;
  amountMinor: number;
  currency: string;
  candidates: string[];
  projects: string[];
  /** Finished invoice HTML, rendered on the server. */
  html: string;
};

type Tab = "hires" | "schedule" | "invoices";

const PLAN: Record<PlacementLedger["plan"], { label: string; tone: Tone }> = {
  upfront: { label: "Paid upfront", tone: "paid" },
  monthly: { label: "Monthly plan", tone: "live" },
  postpaid: { label: "Pay at month end", tone: "live" },
  full_time: { label: "Full-time", tone: "new" },
  unpaid: { label: "Not paid", tone: "waiting" },
};

const STATUS: Record<PlacementLedger["status"], { label: string; tone: Tone }> = {
  fully_paid: { label: "Fully paid", tone: "paid" },
  partially_paid: { label: "Partly paid", tone: "waiting" },
  unpaid: { label: "Not paid", tone: "waiting" },
};

/** Per-currency sum, printed as "₹32,000 + $400". */
function sumLabel(rows: { currency: string; minor: number }[]): string | null {
  const by = new Map<string, number>();
  for (const r of rows) if (r.minor > 0) by.set(r.currency, (by.get(r.currency) ?? 0) + r.minor);
  if (by.size === 0) return null;
  return Array.from(by.entries())
    .map(([c, m]) => formatMoney(m, c, { zeroLabel: false }))
    .join(" + ");
}

function dateRange(start: string | null, end: string | null): string {
  if (!start) return "Start date not set";
  return end ? `${formatDate(start)} – ${formatDate(end)}` : `From ${formatDate(start)}`;
}

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
        // The figures as one line, not three tiles of words ("Nothing paid yet").
        lede={
          hires.length > 0
            ? [
                `${hires.length} hire${hires.length === 1 ? "" : "s"}`,
                paid ? `${paid} paid` : "nothing paid yet",
                // A past date is overdue, never "next" (QA-123).
                left
                  ? `${left} still to pay on hires${
                      nextDue ? (nextDue < today ? `, overdue since ${formatDate(nextDue)}` : `, next instalment ${formatDate(nextDue)}`) : ""
                    }`
                  : "",
                offers,
              ]
                .filter(Boolean)
                .join(" · ")
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

/* ── Shared search, reset and live region (Hires, Schedule, Invoices) ── */

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className={labelClass}>
      Search
      <span className="relative mt-1.5 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(fieldClass, "pl-9")}
        />
      </span>
    </label>
  );
}

function ResetButton({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={!enabled} onClick={onClick} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
      <RotateCcw className="size-4" aria-hidden />
      Reset
    </button>
  );
}

/** Screen-reader count, announced ~300ms after typing stops while any filter is active. */
function LiveCount({ active, shown, total, noun }: { active: boolean; shown: number; total: number; noun: string }) {
  const message = active ? `${shown} of ${total} ${noun} shown` : "";
  const [announced, setAnnounced] = useState(message);
  useEffect(() => {
    const id = setTimeout(() => setAnnounced(message), 300);
    return () => clearTimeout(id);
  }, [message]);
  return (
    <p className="sr-only" role="status">
      {announced}
    </p>
  );
}

/* ── Hires ─────────────────────────────────────────────────────────── */

function HiresPanel({
  hires,
  employerId,
  fteStatus,
  timezone,
  payableIds,
}: {
  hires: HireRow[];
  employerId: string;
  fteStatus: string;
  timezone: string;
  payableIds: string[];
}) {
  // The full-time offer dialog, opened from a row's menu.
  const [ftFor, setFtFor] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const rows = useMemo(() => filterHires(hires, q), [hires, q]);
  if (hires.length === 0) {
    return (
      <EmptyScene
        art
        title="No hires yet"
        body="A candidate becomes a hire once they accept your proposal and you complete the payment. Their placement, dates and invoices land here."
        next={{ label: "Find candidates", href: "/employer/candidates" }}
        who="You - send a proposal"
      />
    );
  }

  function exportCsv() {
    downloadCsv("findtern-hires", rows, [
      { header: "Candidate", value: (h) => h.candidateName },
      { header: "Email", value: (h) => h.candidateEmail ?? "" },
      { header: "Role", value: (h) => h.roleTitle },
      { header: "Project", value: (h) => h.projectName },
      { header: "Type", value: (h) => (h.fullTime ? "Full-time" : "Internship") },
      { header: "Currency", value: (h) => h.currency },
      { header: "Monthly amount", value: (h) => (h.monthlyMinor != null ? h.monthlyMinor / 100 : "") },
      { header: "Annual CTC", value: (h) => (h.annualCtcMinor != null ? h.annualCtcMinor / 100 : "") },
      { header: "Months", value: (h) => (h.fullTime ? "" : h.months) },
      { header: "Start date", value: (h) => h.startDate ?? "" },
      { header: "End date", value: (h) => h.ledger.endsOn ?? "" },
      { header: "Total", value: (h) => h.ledger.totalMinor / 100 },
      { header: "Paid", value: (h) => h.ledger.paidMinor / 100 },
      { header: "Left to pay", value: (h) => h.ledger.dueMinor / 100 },
    ]);
  }

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end lg:grid-cols-[minmax(0,1.6fr)_auto]">
        <SearchField value={q} onChange={setQ} placeholder="Candidate, project or role" />
        <ResetButton enabled={Boolean(q)} onClick={() => setQ("")} />
        <LiveCount active={Boolean(q.trim())} shown={rows.length} total={hires.length} noun="hires" />
      </div>
      {rows.length === 0 ? (
        <EmptyScene title="No hire matches" body="Try another candidate, project or role, or reset the search." className="py-10" />
      ) : (
        <>
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-600">
          <span className="nums font-medium text-ink-900">{rows.length}</span> {rows.length === 1 ? "placement" : "placements"}
          {rows.length !== hires.length ? ` of ${hires.length}` : ""}
        </p>
        <button type="button" onClick={exportCsv} disabled={rows.length === 0} className={buttonClass({ variant: "outline", size: "sm" })}>
          <Download className="size-4" aria-hidden />
          {rows.length !== hires.length ? `Export ${rows.length} shown (CSV)` : "Export hires (CSV)"}
        </button>
      </div>
        <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
          {rows.map((h) => {
            // Pay only where checkout can bill this placement; otherwise the
            // link opened a checkout for a different hire (QA-139).
            const due = h.ledger.dueMinor > 0 && payableIds.includes(h.proposalId);
            const postpaid = h.ledger.plan === "postpaid";
            const owedOffline = h.ledger.dueMinor > 0 && !due && !postpaid;
            const timesheets = `/employer/timesheets?intern=${encodeURIComponent(h.internId)}`;
            const contract = `/employer/proposal/${encodeURIComponent(h.proposalId)}`;
            const plan = PLAN[h.ledger.plan];
            return (
              <li key={h.proposalId} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center">
                <div className="flex min-w-0 items-start gap-3.5">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800">
                    {initials(h.candidateName)}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/employer/intern/${encodeURIComponent(h.internId)}`}
                        className="break-words text-[0.9375rem] font-semibold text-ink-900 underline-offset-4 hover:text-brand-700 hover:underline touch:inline-flex touch:min-h-11 touch:items-center"
                      >
                        {h.candidateName}
                      </Link>
                      <Pill tone={plan.tone}>{plan.label}</Pill>
                    </p>
                    <p className="mt-0.5 text-sm text-ink-600">
                      {h.roleTitle === h.projectName ? h.roleTitle : `${h.roleTitle} · ${h.projectName}`}
                    </p>
                    {owedOffline ? (
                      <p className="mt-1 text-sm text-danger">
                        {formatMoney(h.ledger.dueMinor, h.currency)} unpaid · can&apos;t be paid online; write to communicate@findtern.in
                      </p>
                    ) : null}
                    {postpaid && h.ledger.nextDue ? (
                      <p className="nums mt-1 text-sm font-medium text-ink-900">
                        Month {h.ledger.monthsPaid + 1} of {h.ledger.months} · {due && h.ledger.nextDue <= todayIst() ? "Due now" : `Due on ${formatDate(h.ledger.nextDue)}${due ? " · you can pay it now" : ""}`}
                      </p>
                    ) : null}
                    <p className="nums mt-1 text-sm text-ink-600">
                      {h.fullTime ? `Joining ${h.startDate ? formatDate(h.startDate) : "date to be agreed"}` : dateRange(h.startDate, h.ledger.endsOn)}
                    </p>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <dt className="text-ink-600">{h.fullTime ? "Annual CTC" : "Monthly"}</dt>
                  <dd className="nums text-right font-medium text-ink-900 lg:text-left">
                    {h.fullTime
                      ? h.annualCtcMinor != null
                        ? formatMoney(h.annualCtcMinor, h.currency, { zeroLabel: false })
                        : "-"
                      : h.monthlyMinor != null
                        ? `${formatMoney(h.monthlyMinor, h.currency)}/month`
                        : "-"}
                  </dd>
                  <dt className="text-ink-600">{h.fullTime ? "Hiring fee" : "Duration"}</dt>
                  <dd className="nums text-right font-medium text-ink-900 lg:text-left">
                    {h.fullTime
                      ? formatMoney(h.ledger.totalMinor, h.currency, { zeroLabel: false })
                      : <span className="whitespace-nowrap">{`${h.months} month${h.months === 1 ? "" : "s"}${h.ledger.plan === "monthly" ? ` · ${h.ledger.monthsPaid} paid` : ""}`}</span>}
                  </dd>
                </dl>

                {/* One visible action by state: Pay while money is due (it was
                    only reachable from the page header), else Timesheets, else
                    the contract; the rest are in the menu (QA-122). */}
                <div className="flex items-center gap-1 lg:justify-end">
                  {due ? (
                    <ButtonLink href={`/employer/checkout?proposal=${encodeURIComponent(h.proposalId)}`} variant="accent" size="sm">
                      <CreditCard className="size-4" aria-hidden />
                      Pay {formatMoney(postpaid ? (h.monthlyMinor ?? h.ledger.dueMinor) : h.ledger.dueMinor, h.currency)}
                    </ButtonLink>
                  ) : !h.fullTime ? (
                    <ButtonLink href={timesheets} variant="outline" size="sm">
                      Timesheets
                    </ButtonLink>
                  ) : (
                    <ButtonLink href={contract} variant="outline" size="sm">
                      <FileText className="size-4" aria-hidden />
                      Contract
                    </ButtonLink>
                  )}
                  <RowMenu
                    label={`More actions for ${h.candidateName}`}
                    items={[
                      ...(due && !h.fullTime ? [{ label: "Timesheets", href: timesheets, icon: <CalendarCheck /> }] : []),
                      ...(due || !h.fullTime ? [{ label: "Contract", href: contract, icon: <FileText /> }] : []),
                      ...(h.canOfferFullTime ? [{ label: "Full-time offer", onSelect: () => setFtFor(h.proposalId), icon: <BriefcaseBusiness /> }] : []),
                    ]}
                  />
                  {h.canOfferFullTime ? (
                    <FullTimeOfferButton
                      employerId={employerId}
                      proposalId={h.proposalId}
                      candidate={h.candidateName}
                      fteStatus={fteStatus}
                      timezone={timezone}
                      open={ftFor === h.proposalId}
                      onOpenChange={(o) => setFtFor(o ? h.proposalId : null)}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </Surface>
        </>
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/* ── Payment schedule (legacy "Upcoming payments") ──────────────────── */

type ScheduleFilter = "all" | "partially_paid" | "fully_paid";

function SchedulePanel({ hires, payableIds }: { hires: HireRow[]; payableIds: string[] }) {
  const today = todayIst();
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => filterHires(hires, q).filter((h) => filter === "all" || h.ledger.status === filter), [hires, q, filter]);

  if (hires.length === 0) {
    return (
      <EmptyScene
        art
        title="No payment schedule yet"
        body="Each hire's total, what you've paid and the next instalment date appear here once a placement starts."
        next={{ label: "Your proposals", href: "/employer/proposals" }}
        who="You - complete a hire"
      />
    );
  }

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end lg:grid-cols-[minmax(0,1.6fr)_auto]">
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
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by payment state">
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
              filter === id ? "border-brand-700 bg-brand-700 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyScene
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
          className="py-10"
        />
      ) : (
        /* Below lg each hire stacks into labelled lines ([data-stack], globals.css); the wide table only from lg. */
        <Surface data-stack tabIndex={0} role="region" aria-label="Hires and payments" className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
          <table className="w-full border-collapse lg:min-w-[52rem]">
            <thead className="border-b border-ink-100 bg-ink-50/60">
              <tr>
                <th scope="col" className={thClass}>Candidate</th>
                <th scope="col" className={cn(thClass, "text-right")}>Total</th>
                <th scope="col" className={cn(thClass, "text-right")}>Paid</th>
                <th scope="col" className={cn(thClass, "text-right")}>Left</th>
                <th scope="col" className={thClass}>Paid on</th>
                <th scope="col" className={thClass}>Next due</th>
                <th scope="col" className={cn(thClass, "text-right")}>
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
                return (
                  <tr key={h.proposalId}>
                    <td data-title className={tdClass}>
                      <div className="min-w-0 [overflow-wrap:anywhere]">
                        <p className="font-medium text-ink-900">{h.candidateName}</p>
                        <p className="text-sm text-ink-600">{h.projectName}</p>
                        <Pill tone={s.tone} className="mt-1.5">{s.label}</Pill>
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
                            <span className="font-medium text-danger">Overdue since {formatDate(h.ledger.nextDue)}</span>
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
                    <td className={cn(tdClass, "text-right")}>
                      {h.ledger.dueMinor > 0 && (h.ledger.plan === "monthly" || (h.ledger.plan === "postpaid" && payableIds.includes(h.proposalId))) ? (
                        <ButtonLink href={`/employer/checkout?proposal=${encodeURIComponent(h.proposalId)}`} size="sm">
                          Pay month {h.ledger.monthsPaid + 1}
                        </ButtonLink>
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

/* ── Invoices (legacy payment history) ─────────────────────────────── */

function InvoicesPanel({ invoices }: { invoices: InvoiceRow[] }) {
  const [q, setQ] = useState("");
  const [currency, setCurrency] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [viewing, setViewing] = useState<InvoiceRow | null>(null);
  // The dialog is opened by state, not by a Radix trigger, so it is told where to hand focus back to.
  const viewerOpener = useRef<HTMLElement | null>(null);
  const viewerDownload = useRef<HTMLButtonElement>(null);
  const currencies = Array.from(new Set(invoices.map((i) => i.currency)));
  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (currency !== "all" && i.currency !== currency) return false;
      const day = i.paidAt?.slice(0, 10) ?? "";
      if (from && (!day || day < from)) return false;
      if (to && (!day || day > to)) return false;
      return matchesQuery(q, [i.number, i.orderId, i.paymentId, i.currency, day, i.paidAt ? formatDate(i.paidAt) : "", ...i.candidates, ...i.projects]);
    });
  }, [invoices, q, currency, from, to]);
  const filtering = Boolean(q) || currency !== "all" || from || to;

  if (invoices.length === 0) {
    return (
      <EmptyScene
        art
        title="No invoices yet"
        body="A tax invoice is issued for every completed payment. Cancelled or failed checkouts don't create one."
        next={{ label: "Go to checkout", href: "/employer/checkout" }}
        who="You - complete a payment"
      />
    );
  }

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_10rem_10rem_10rem_auto] lg:items-end">
        <SearchField value={q} onChange={setQ} placeholder="Candidate, project, invoice or order ID" />
        <label className={labelClass}>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={cn(fieldClass, "mt-1.5")}>
            <option value="all">All</option>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Paid from
          <DmyDateInput value={from} onChange={setFrom} className={cn(fieldClass, "mt-1.5")} />
        </label>
        <label className={labelClass}>
          Paid to
          <DmyDateInput value={to} onChange={setTo} className={cn(fieldClass, "mt-1.5")} />
        </label>
        <ResetButton
          enabled={Boolean(filtering)}
          onClick={() => {
            setQ("");
            setCurrency("all");
            setFrom("");
            setTo("");
          }}
        />
        <LiveCount active={Boolean(filtering)} shown={filtered.length} total={invoices.length} noun="invoices" />
      </div>

      {filtered.length === 0 ? (
        <EmptyScene title="No invoice matches" body="Try another name or ID, or reset the filters to see every invoice." className="py-10" />
      ) : (
        <Surface data-stack tabIndex={0} role="region" aria-label="Invoices" className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
          <table className="w-full border-collapse lg:min-w-[48rem]">
            <thead className="border-b border-ink-100 bg-ink-50">
              <tr>
                <th scope="col" className={thClass}>Invoice</th>
                <th scope="col" className={thClass}>Candidate</th>
                <th scope="col" className={thClass}>Project</th>
                <th scope="col" className={cn(thClass, "text-right")}>Amount</th>
                <th scope="col" className={thClass}>Paid on</th>
                {/* From lg the wide table can scroll sideways, so the actions stay pinned to the right edge; below lg rows stack and nothing scrolls. */}
                <th scope="col" className={cn(thClass, "text-right lg:sticky lg:right-0 lg:bg-ink-50 lg:shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.12)]")}>
                  <span className="sr-only">View or download</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td data-title className={tdClass}>
                    <div className="min-w-0 [overflow-wrap:anywhere]">
                      <p className="nums font-medium text-ink-900">{i.number}</p>
                      <p className="break-all font-mono text-xs text-text-subtle lg:max-w-[14rem] lg:truncate" title={i.orderId}>
                        {i.orderId}
                      </p>
                    </div>
                  </td>
                  <td data-label="Candidate" className={cn(tdClass, "[overflow-wrap:anywhere]")}>{i.candidates.join(", ") || "-"}</td>
                  <td data-label="Project" className={cn(tdClass, "[overflow-wrap:anywhere]")}>{i.projects.join(", ") || "-"}</td>
                  <td data-label="Amount" className={cn(tdClass, "nums text-right font-semibold text-ink-900")}>
                    {formatMoney(i.amountMinor, i.currency, { zeroLabel: false })}
                  </td>
                  <td data-label="Paid on" className={cn(tdClass, "nums")}>{i.paidAt ? formatDate(i.paidAt) : "-"}</td>
                  <td className={cn(tdClass, "text-right lg:sticky lg:right-0 lg:bg-white lg:shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.12)]")}>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          viewerOpener.current = e.currentTarget;
                          setViewing(i);
                        }}
                        aria-label={`View invoice ${i.number}`}
                        className={buttonClass({ variant: "outline", size: "sm" })}
                      >
                        <Eye className="size-4" aria-hidden />
                        View
                      </button>
                      <RowMenu
                        label={`More actions for invoice ${i.number}`}
                        items={[{ label: "Download", icon: <Download />, onSelect: () => downloadInvoice(i.html, invoiceFileName(i)) }]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      )}

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent
          className="sm:max-w-4xl"
          // Radix would focus the first tabbable thing, the invoice iframe, and a focused iframe swallows Escape.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            viewerDownload.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (viewerOpener.current?.isConnected) viewerOpener.current.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Tax invoice {viewing?.number}</DialogTitle>
            <DialogDescription className="sr-only">The invoice as it prints. Use Download to save it as a PDF.</DialogDescription>
          </DialogHeader>
          {viewing ? (
            // A full HTML page the server rendered. Sandboxed with no permissions, so
            // nothing inside it can run script or reach this page.
            <iframe title={`Invoice ${viewing.number}`} sandbox="" srcDoc={viewing.html} className="h-[65vh] w-full rounded-apple-sm border border-ink-200 bg-white" />
          ) : null}
          <div className="flex justify-end">
            <button
              ref={viewerDownload}
              type="button"
              onClick={() => viewing && downloadInvoice(viewing.html, invoiceFileName(viewing))}
              className={buttonClass({ size: "sm" })}
            >
              <Download className="size-4" aria-hidden />
              Download
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const invoiceFileName = (i: Pick<InvoiceRow, "number">) => `Invoice-${i.number.replace(/\//g, "-")}.pdf`;
