"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BriefcaseBusiness, CalendarCheck, CreditCard, Download, FileText } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { FullTimeOfferButton } from "@/components/employer/full-time-offer-button";
import { RowMenu } from "@/components/app/row-menu";
import { downloadCsv } from "@/lib/admin/csv";
import { formatDate, formatMoney } from "@/lib/format";
import { filterHires } from "@/lib/orders-filter";
import { todayIst } from "@/lib/offer";
import { cn } from "@/lib/utils";
import type { HireRow } from "./types";
import { OrdersEmpty } from "./empty";
import { INLINE_LINK, PLAN, TOOLBAR_CARD, dateRange, feePaidMinor, LiveCount, ResetButton, SearchField } from "./shared";

const PAYMENTS_EMAIL = "communicate@findtern.in";

/** A pre-filled request for a payment link, naming this company's own hire and what is owed on it. */
function paymentLinkHref(h: HireRow): string {
  const owed = formatMoney(h.ledger.dueMinor, h.currency);
  const subject = `Payment link for ${h.candidateName} (${owed})`;
  const body = [
    "Hello Findtern,",
    "",
    `Please send me a payment link for ${h.candidateName}'s placement (${h.roleTitle === h.projectName ? h.roleTitle : `${h.roleTitle}, ${h.projectName}`}).`,
    `Outstanding: ${owed}.`,
    `Proposal reference: ${h.proposalId}`,
  ].join("\n");
  return `mailto:${PAYMENTS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const DAY_MS = 86_400_000;
const dayNum = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS;

/** Elapsed share of the contract from its real start and end dates; null when either is missing or the range is empty. */
function contractProgress(start: string | null, end: string | null): { pct: number; note: string } | null {
  if (!start || !end) return null;
  const s = dayNum(start);
  const e = dayNum(end);
  const t = dayNum(todayIst());
  if (!(e > s) || Number.isNaN(t)) return null;
  if (t < s) return { pct: 0, note: `Starts in ${Math.ceil(s - t)} ${Math.ceil(s - t) === 1 ? "day" : "days"}` };
  if (t >= e) return { pct: 100, note: "Contract ended" };
  const total = Math.round(e - s);
  const day = Math.floor(t - s) + 1;
  return { pct: Math.min(100, Math.max(0, ((t - s) / (e - s)) * 100)), note: `Day ${day} of ${total}` };
}

/**
 * A hire's life as a trail of dated stops (Paid, Starts, Ends): filled once reached, hollow while ahead. The words
 * and dates carry it; the dot only repeats them. `note` is the one-line progress ("Day 4 of 91", "Starts in 3 days").
 */
function StageTrail({ stops, note }: { stops: { label: string; date: string | null; done: boolean }[]; note: string | null }) {
  return (
    <div className="mt-3 max-w-sm">
      <ol className="relative flex justify-between">
        <span aria-hidden className="absolute inset-x-1 top-[5px] h-px bg-ink-300" />
        {stops.map((st, i) => (
          <li key={st.label} className={cn("relative flex min-w-0 flex-col", i === 0 ? "items-start" : i === stops.length - 1 ? "items-end text-right" : "items-center text-center")}>
            <span aria-hidden className={cn("size-[11px] rounded-full border", st.done ? "border-brand-800 bg-brand-800" : "border-ink-400 bg-canvas")} />
            <span className="mt-1.5 text-xs font-medium text-ink-800">
              {st.label}
              <span className="sr-only">{st.done ? " (done)" : " (ahead)"}</span>
            </span>
            <span className="nums text-xs text-ink-600">{st.date ? formatDate(st.date) : "date not set"}</span>
          </li>
        ))}
      </ol>
      {note ? <p className="mt-2 text-xs text-ink-600">{note}</p> : null}
    </div>
  );
}

const payHref = (h: HireRow) => `/employer/checkout?proposal=${encodeURIComponent(h.proposalId)}`;

/**
 * The ledger's columns, from xl up: hire, period, paid, actions. Each hire is a ruled row, not a card; below xl the
 * same four blocks stack and every figure carries its own visible label.
 */
const COLS = "xl:grid xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_11rem_13rem] xl:items-start xl:gap-x-8";

/** A field's label: visible when stacked, a screen-reader label in the wide table. */
const FIELD_LABEL = "mb-0.5 block text-xs font-medium text-ink-600 xl:sr-only";

export function HiresPanel({
  hires,
  employerId,
  fteStatus,
  timezone,
  payableIds,
  emptyPrimary = true,
}: {
  hires: HireRow[];
  employerId: string;
  fteStatus: string;
  timezone: string;
  payableIds: string[];
  /** False when the page header already carries the one filled button. */
  emptyPrimary?: boolean;
}) {
  // The full-time offer dialog, opened from a row's menu.
  const [ftFor, setFtFor] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const rows = useMemo(() => filterHires(hires, q), [hires, q]);
  // Same rule as each row's "pay offline" line, over the rows shown.
  const offlineRows = rows.filter((h) => h.ledger.dueMinor > 0 && !payableIds.includes(h.proposalId) && h.ledger.plan !== "postpaid");
  const offline = {
    count: offlineRows.length,
    minor: offlineRows.reduce((n, h) => n + h.ledger.dueMinor, 0),
    currency: offlineRows[0]?.currency ?? "INR",
  };
  if (hires.length === 0) {
    return (
      <OrdersEmpty
        primary={emptyPrimary}
        title="No hires yet"
        body="Their placement, dates and invoices land here as soon as a hire is paid."
        steps={["Send a proposal to a candidate", "They accept your offer", "You pay, and they become a hire"]}
        next={{ label: "Find candidates", href: "/employer/candidates" }}
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
      { header: "Hiring fee", value: (h) => (h.fullTime ? "" : h.feeMinor / 100) },
      { header: "Paid", value: (h) => h.ledger.paidMinor / 100 },
      { header: "Left to pay", value: (h) => h.ledger.dueMinor / 100 },
    ]);
  }

  return (
    <div>
      <div className={cn(TOOLBAR_CARD, "flex items-center gap-2")}>
        <div className="min-w-0 flex-1 xl:max-w-md">
          <SearchField value={q} onChange={setQ} placeholder="Search hires" />
        </div>
        <ResetButton enabled={Boolean(q)} onClick={() => setQ("")} />
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className={buttonClass({ variant: "outline", size: "sm", className: "h-11 shrink-0 xl:ml-auto" })}
        >
          <Download className="size-4" aria-hidden />
          <span><span className="max-sm:sr-only">{rows.length !== hires.length ? `Export ${rows.length} shown` : "Export"}</span> CSV</span>
        </button>
        <LiveCount active={Boolean(q.trim())} shown={rows.length} total={hires.length} noun="hires" />
      </div>
      {rows.length === 0 ? (
        <OrdersEmpty compact title="No hire matches" body="Try another candidate, project or role, or reset the search." />
      ) : (
        <>
          {/* The tab already counts the hires; a count here only says what a search left. */}
          {rows.length !== hires.length ? (
            <p className="mb-3 text-sm text-ink-700">
              <span className="nums font-medium text-ink-900">{rows.length}</span> of {hires.length} {hires.length === 1 ? "placement" : "placements"}
            </p>
          ) : null}
          {offline.count ? (
            <p role="note" className="mb-3 flex items-start gap-2 text-sm text-ink-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
              <span>
                <span className="nums font-semibold">{formatMoney(offline.minor, offline.currency)}</span> on {offline.count} {offline.count === 1 ? "hire" : "hires"} can&apos;t be paid at online checkout. Use{" "}
                <span className="font-medium">Request a payment link</span> on {offline.count === 1 ? "that hire" : "each one"}.
              </span>
            </p>
          ) : null}

          {/* Column headings: from xl; below it each row labels its own fields. */}
          <div aria-hidden className={cn(COLS, "hidden py-2 text-xs font-medium text-ink-600")}>
            <span>Hire</span>
            <span>Period</span>
            <span>Paid</span>
            <span />
          </div>
          <ul aria-label="Hires" className="divide-y divide-ink-200 border-y border-ink-200">
            {rows.map((h) => {
              // Pay only where checkout can bill this placement; otherwise the
              // link opened a checkout for a different hire (QA-139).
              const due = h.ledger.dueMinor > 0 && payableIds.includes(h.proposalId);
              const postpaid = h.ledger.plan === "postpaid";
              const owedOffline = h.ledger.dueMinor > 0 && !due && !postpaid;
              const timesheets = `/employer/timesheets?intern=${encodeURIComponent(h.internId)}`;
              const contract = `/employer/proposal/${encodeURIComponent(h.proposalId)}`;
              const plan = PLAN[h.ledger.plan];
              const fee = feePaidMinor(h);
              const progress = h.fullTime ? null : contractProgress(h.startDate, h.ledger.endsOn);
              const paidDates = h.ledger.paidOn;
              const firstPaid = paidDates.length ? paidDates[0] : null;
              const share = h.ledger.totalMinor > 0 ? Math.min(100, (h.ledger.paidMinor / h.ledger.totalMinor) * 100) : 0;
              return (
                <li key={h.proposalId} className={cn(COLS, "py-6")}>
                  <div className="min-w-0">
                    <Link
                      href={`/employer/intern/${encodeURIComponent(h.internId)}`}
                      className="inline-flex min-h-11 items-center break-words font-display text-lg font-semibold text-ink-900 underline-offset-4 hover:text-brand-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 xl:min-h-0"
                    >
                      {h.candidateName}
                    </Link>
                    <p className="break-words text-sm text-ink-700">{h.roleTitle}</p>
                    {h.projectName !== h.roleTitle ? <p className="break-words text-sm text-ink-600">{h.projectName}</p> : null}
                    {owedOffline ? (
                      <p className="nums mt-2 text-sm text-ink-900">
                        <span className="font-semibold text-[#9a4a08]">{formatMoney(h.ledger.dueMinor, h.currency)}</span> owed · checkout can&apos;t bill this one online ·{" "}
                        <a href={paymentLinkHref(h)} className={INLINE_LINK}>
                          Request a payment link
                        </a>
                      </p>
                    ) : null}
                    {due && !postpaid ? (
                      <p className="nums mt-2 text-sm text-ink-900">
                        <span className="font-semibold text-[#9a4a08]">{formatMoney(h.ledger.dueMinor, h.currency)}</span> to pay ·{" "}
                        <Link href={payHref(h)} className={INLINE_LINK}>
                          Pay now
                        </Link>
                      </p>
                    ) : null}
                    {postpaid && h.ledger.nextDue ? (
                      <p className="nums mt-2 text-sm font-medium text-ink-900">
                        Month {h.ledger.monthsPaid + 1} of {h.ledger.months} · {due && h.ledger.nextDue <= todayIst() ? "Due now" : `Due on ${formatDate(h.ledger.nextDue)}${due ? " · you can pay it now" : ""}`}
                        {due ? (
                          <>
                            {" · "}
                            <Link href={payHref(h)} className={INLINE_LINK}>
                              Pay now
                            </Link>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 xl:contents">
                    <div className="nums col-span-2 min-w-0 xl:col-span-1">
                      <dt className={FIELD_LABEL}>Period</dt>
                      <dd className="text-sm text-ink-900">
                        <span className="whitespace-nowrap">{h.fullTime ? `Joining ${h.startDate ? formatDate(h.startDate) : "to be agreed"}` : dateRange(h.startDate, h.ledger.endsOn)}</span>
                        <span className="block text-sm text-ink-700">
                          {h.fullTime ? (
                            h.annualCtcMinor != null ? `${formatMoney(h.annualCtcMinor, h.currency, { zeroLabel: false })} a year` : "CTC not set"
                          ) : (
                            <>
                              {h.months} month{h.months === 1 ? "" : "s"}
                              {h.monthlyMinor != null ? ` · ${formatMoney(h.monthlyMinor, h.currency)} / month` : ""}
                              {h.ledger.plan === "monthly" ? ` · ${h.ledger.monthsPaid} paid` : ""}
                            </>
                          )}
                        </span>
                        <StageTrail
                          stops={[
                            ...(firstPaid ? [{ label: "Paid", date: firstPaid, done: true }] : []),
                            { label: h.fullTime ? "Joins" : "Starts", date: h.startDate, done: Boolean(progress && progress.pct > 0) || (h.fullTime && Boolean(h.startDate) && h.startDate! <= todayIst()) },
                            ...(h.fullTime || !h.ledger.endsOn ? [] : [{ label: "Ends", date: h.ledger.endsOn, done: Boolean(progress && progress.pct >= 100) }]),
                          ]}
                          note={progress?.note ?? null}
                        />
                      </dd>
                    </div>
                    <div className="nums col-span-2 xl:col-span-1">
                      <dt className={FIELD_LABEL}>Paid</dt>
                      <dd>
                        <span className="block font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">{formatMoney(h.ledger.paidMinor, h.currency, { zeroLabel: false })}</span>
                        <span className="block text-sm text-ink-700">
                          {h.ledger.dueMinor > 0 ? `of ${formatMoney(h.ledger.totalMinor, h.currency, { zeroLabel: false })}` : "Paid in full"}
                        </span>
                        <span className="block text-xs text-ink-600">{h.fullTime ? "hiring fee" : fee > 0 ? `incl. ${formatMoney(fee, h.currency, { zeroLabel: false })} fee` : "\u00a0"}</span>
                        {h.ledger.dueMinor > 0 && h.ledger.totalMinor > 0 ? (
                          <span aria-hidden className="mt-2 flex h-1.5 max-w-[11rem] overflow-hidden rounded-md bg-signal/25">
                            <span className="block h-full bg-brand-700" style={{ width: `${share}%` }} />
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  </dl>

                  {/* One visible action by state: Pay while money is due, else Timesheets, else the contract; the rest are in the menu (QA-122). */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 xl:mt-0 xl:flex-col xl:items-end">
                    <Pill tone={plan.tone} icon={<span aria-hidden className="!size-2 rounded-full bg-current" />}>{plan.label}</Pill>
                    <div className="flex items-center gap-1">
                      {due ? (
                        <ButtonLink href={payHref(h)} variant="outline" size="sm">
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
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
