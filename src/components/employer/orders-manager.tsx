"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CalendarCheck, CreditCard, Download, FileText, RotateCcw, Search } from "lucide-react";

import { EmptyScene, PageHead, Pill, Surface, type Tone } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { FullTimeOfferButton } from "@/components/employer/full-time-offer-button";
import { RowMenu } from "@/components/app/row-menu";
import { fieldClass, labelClass, tabClass, tdClass, thClass } from "@/components/employer/ui-tokens";
import { downloadCsv } from "@/lib/admin/csv";
import type { PlacementLedger } from "@/lib/dues";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadInvoice } from "@/lib/invoice";
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
  offersToPay,
  payableIds,
}: {
  employerId: string;
  fteStatus: string;
  timezone: string;
  hires: HireRow[];
  invoices: InvoiceRow[];
  /** Accepted offers and due months waiting at checkout. */
  payableCount: number;
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
          payableCount > 0 ? (
            <ButtonLink href="/employer/checkout" variant="accent">
              {payableCount === 1 ? "1 payment due" : `${payableCount} payments due`}
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          ) : null
        }
      />

      <div role="tablist" aria-label="Orders" className="-mx-1 mb-6 flex max-w-full gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`orders-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`orders-panel-${t.id}`}
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
          <SchedulePanel hires={hires} />
        ) : (
          <InvoicesPanel invoices={invoices} />
        )}
      </div>
    </div>
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
    downloadCsv("findtern-hires", hires, [
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
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-600">
          <span className="nums font-medium text-ink-900">{hires.length}</span> {hires.length === 1 ? "placement" : "placements"}
        </p>
        <button type="button" onClick={exportCsv} className={buttonClass({ variant: "outline", size: "sm" })}>
          <Download className="size-4" aria-hidden />
          Export hires (CSV)
        </button>
      </div>
      <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
        {hires.map((h) => {
          // Pay only where checkout can bill this placement; otherwise the
          // link opened a checkout for a different hire (QA-139).
          const due = h.ledger.dueMinor > 0 && payableIds.includes(h.proposalId);
          const owedOffline = h.ledger.dueMinor > 0 && !due;
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
                      className="break-words text-[0.9375rem] font-semibold text-ink-900 underline-offset-4 hover:text-brand-700 hover:underline"
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
                    Pay {formatMoney(h.ledger.dueMinor, h.currency)}
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
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/* ── Payment schedule (legacy "Upcoming payments") ──────────────────── */

type ScheduleFilter = "all" | "partially_paid" | "fully_paid";

function SchedulePanel({ hires }: { hires: HireRow[] }) {
  const today = todayIst();
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  const rows = hires.filter((h) => filter === "all" || h.ledger.status === filter);

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
              "apple-spring min-h-9 rounded-full border px-3.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-600/30",
              filter === id ? "border-brand-700 bg-brand-700 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyScene title="Nothing matches this filter" body="No hire is in that payment state right now." className="py-10" />
      ) : (
        <Surface className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse">
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
                const s = STATUS[h.ledger.status];
                const m = (minor: number) => formatMoney(minor, h.currency, { zeroLabel: false });
                return (
                  <tr key={h.proposalId}>
                    <td className={tdClass}>
                      <p className="font-medium text-ink-900">{h.candidateName}</p>
                      <p className="text-sm text-ink-600">{h.projectName}</p>
                      <Pill tone={s.tone} className="mt-1.5">{s.label}</Pill>
                    </td>
                    <td className={cn(tdClass, "nums text-right font-medium text-ink-900")}>{m(h.ledger.totalMinor)}</td>
                    <td className={cn(tdClass, "nums text-right")}>{h.ledger.paidMinor > 0 ? m(h.ledger.paidMinor) : "-"}</td>
                    <td className={cn(tdClass, "nums text-right font-semibold", h.ledger.dueMinor > 0 ? "text-ink-900" : "text-text-subtle")}>
                      {h.ledger.dueMinor > 0 ? m(h.ledger.dueMinor) : "-"}
                    </td>
                    <td className={cn(tdClass, "nums")}>
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
                    <td className={cn(tdClass, "nums")}>
                      {h.ledger.nextDue ? (
                        <>
                          {h.ledger.nextDue < today ? (
                            <span className="font-medium text-danger">Overdue since {formatDate(h.ledger.nextDue)}</span>
                          ) : (
                            formatDate(h.ledger.nextDue)
                          )}
                          <span className="block text-xs text-text-subtle">
                            Month {h.ledger.monthsPaid + 1} of {h.ledger.months}
                          </span>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className={cn(tdClass, "text-right")}>
                      {h.ledger.dueMinor > 0 && h.ledger.plan === "monthly" ? (
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
  const currencies = Array.from(new Set(invoices.map((i) => i.currency)));
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return invoices.filter((i) => {
      if (currency !== "all" && i.currency !== currency) return false;
      const day = i.paidAt?.slice(0, 10) ?? "";
      if (from && (!day || day < from)) return false;
      if (to && (!day || day > to)) return false;
      if (!needle) return true;
      return [i.number, i.orderId, i.paymentId ?? "", ...i.candidates, ...i.projects].some((v) => v.toLowerCase().includes(needle));
    });
  }, [invoices, q, currency, from, to]);
  const filtering = q || currency !== "all" || from || to;

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
        <label className={labelClass}>
          Search
          <span className="relative mt-1.5 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Candidate, project, invoice or order ID"
              className={cn(fieldClass, "pl-9")}
            />
          </span>
        </label>
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
        <button
          type="button"
          disabled={!filtering}
          onClick={() => {
            setQ("");
            setCurrency("all");
            setFrom("");
            setTo("");
          }}
          className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}
        >
          <RotateCcw className="size-4" aria-hidden />
          Reset
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyScene title="No invoice matches" body="Try another name or ID, or reset the filters to see every invoice." className="py-10" />
      ) : (
        <Surface className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse">
            <thead className="border-b border-ink-100 bg-ink-50/60">
              <tr>
                <th scope="col" className={thClass}>Invoice</th>
                <th scope="col" className={thClass}>Candidate</th>
                <th scope="col" className={thClass}>Project</th>
                <th scope="col" className={cn(thClass, "text-right")}>Amount</th>
                <th scope="col" className={thClass}>Paid on</th>
                <th scope="col" className={cn(thClass, "text-right")}>
                  <span className="sr-only">Download</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td className={tdClass}>
                    <p className="nums font-medium text-ink-900">{i.number}</p>
                    <p className="max-w-[14rem] truncate font-mono text-xs text-text-subtle" title={i.orderId}>
                      {i.orderId}
                    </p>
                  </td>
                  <td className={tdClass}>{i.candidates.join(", ") || "-"}</td>
                  <td className={tdClass}>{i.projects.join(", ") || "-"}</td>
                  <td className={cn(tdClass, "nums text-right font-semibold text-ink-900")}>
                    {formatMoney(i.amountMinor, i.currency, { zeroLabel: false })}
                  </td>
                  <td className={cn(tdClass, "nums")}>{i.paidAt ? formatDate(i.paidAt) : "-"}</td>
                  <td className={cn(tdClass, "text-right")}>
                    <button
                      type="button"
                      onClick={() => downloadInvoice(i.html, `Invoice-${i.number.replace(/\//g, "-")}.pdf`)}
                      className={buttonClass({ variant: "outline", size: "sm" })}
                    >
                      <Download className="size-4" aria-hidden />
                      Tax invoice
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      )}
    </div>
  );
}
