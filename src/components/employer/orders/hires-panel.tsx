"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BriefcaseBusiness, CalendarCheck, CreditCard, Download, FileText } from "lucide-react";

import { EmptyScene, Pill } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { FullTimeOfferButton } from "@/components/employer/full-time-offer-button";
import { RowMenu } from "@/components/app/row-menu";
import { downloadCsv } from "@/lib/admin/csv";
import { formatDate, formatMoney } from "@/lib/format";
import { filterHires } from "@/lib/orders-filter";
import { todayIst } from "@/lib/offer";
import { cn } from "@/lib/utils";
import { tintFor } from "@/components/employer/dashboard/card-geometry";
import type { HireRow } from "./types";
import { INLINE_LINK, PLAN, dateRange, feePaidMinor, initials, LiveCount, ResetButton, SearchField } from "./shared";

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

const payHref = (h: HireRow) => `/employer/checkout?proposal=${encodeURIComponent(h.proposalId)}`;

/**
 * The columns, from lg up: hire, monthly rate, period, paid, status, actions.
 * Hire is the flexible column; the rest are fixed, so every row lines up
 * under its heading and a date range never has to wrap; below lg each hire is a card with the same fields labelled.
 */
const COLS = "lg:grid lg:grid-cols-[minmax(230px,1fr)_104px_200px_130px_130px_8.5rem] lg:items-center lg:gap-x-4";

/** A field's label: visible on the card, a screen-reader label in the table. */
const FIELD_LABEL = "mb-0.5 block text-xs font-medium text-ink-600 lg:sr-only";

export function HiresPanel({
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
  // Same rule as each row's "pay offline" line, over the rows shown.
  const offlineRows = rows.filter((h) => h.ledger.dueMinor > 0 && !payableIds.includes(h.proposalId) && h.ledger.plan !== "postpaid");
  const offline = {
    count: offlineRows.length,
    minor: offlineRows.reduce((n, h) => n + h.ledger.dueMinor, 0),
    currency: offlineRows[0]?.currency ?? "INR",
  };
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
      { header: "Hiring fee", value: (h) => (h.fullTime ? "" : h.feeMinor / 100) },
      { header: "Paid", value: (h) => h.ledger.paidMinor / 100 },
      { header: "Left to pay", value: (h) => h.ledger.dueMinor / 100 },
    ]);
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="min-w-0 flex-1 lg:max-w-md">
          <SearchField value={q} onChange={setQ} placeholder="Search hires" />
        </div>
        <ResetButton enabled={Boolean(q)} onClick={() => setQ("")} />
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className={buttonClass({ variant: "outline", size: "sm", className: "h-11 shrink-0 lg:ml-auto" })}
        >
          <Download className="size-4" aria-hidden />
          <span><span className="max-sm:sr-only">{rows.length !== hires.length ? `Export ${rows.length} shown` : "Export"}</span> CSV</span>
        </button>
        <LiveCount active={Boolean(q.trim())} shown={rows.length} total={hires.length} noun="hires" />
      </div>
      {rows.length === 0 ? (
        <EmptyScene title="No hire matches" body="Try another candidate, project or role, or reset the search." className="py-10" />
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
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>
                <span className="nums font-semibold">{formatMoney(offline.minor, offline.currency)}</span> on {offline.count} {offline.count === 1 ? "hire" : "hires"} can&apos;t be paid at online checkout. Use{" "}
                <span className="font-medium">Request a payment link</span> on {offline.count === 1 ? "that hire" : "each one"}.
              </span>
            </p>
          ) : null}

          {/* Column headings: the table's header row from lg; below it each card labels its own fields. */}
          <div className="lg:overflow-x-auto lg:rounded-2xl lg:border lg:border-ink-200 lg:bg-white lg:shadow-[0_1px_2px_rgba(16,24,20,0.04)]">
          <div className="lg:min-w-[1010px]">
          <div aria-hidden className={cn(COLS, "hidden border-b border-ink-200 bg-ink-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-600")}>
            <span>Hire</span>
            <span>Monthly</span>
            <span>Period</span>
            <span className="text-right">Paid</span>
            <span>Status</span>
            <span />
          </div>
          <ul aria-label="Hires" className="space-y-3 lg:space-y-0 lg:divide-y lg:divide-ink-100">
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
              return (
                <li key={h.proposalId} className={cn(COLS, "rounded-xl border border-ink-200 bg-white p-4 transition-colors lg:rounded-none lg:border-0 lg:px-4 lg:py-4 lg:even:bg-ink-50/60 lg:hover:bg-brand-50/70")}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ring-1 ring-inset ring-black/5", tintFor(h.internId))}>
                        {initials(h.candidateName)}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/employer/intern/${encodeURIComponent(h.internId)}`}
                          className="block break-words text-base font-medium text-ink-900 underline-offset-4 hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 touch:inline-flex touch:min-h-11 touch:items-center"
                        >
                          {h.candidateName}
                        </Link>
                        <p className="truncate text-sm text-ink-700" title={h.roleTitle}>
                          {h.roleTitle}
                        </p>
                        {h.projectName !== h.roleTitle ? (
                          <p className="truncate text-sm text-ink-600" title={h.projectName}>
                            {h.projectName}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {owedOffline ? (
                      <p className="nums mt-2 text-sm text-ink-900 lg:pl-[3.25rem]">
                        <span className="font-semibold">{formatMoney(h.ledger.dueMinor, h.currency)}</span> owed · checkout can&apos;t bill this one online ·{" "}
                        <a href={paymentLinkHref(h)} className={INLINE_LINK}>
                          Request a payment link
                        </a>
                      </p>
                    ) : null}
                    {due && !postpaid ? (
                      <p className="nums mt-2 text-sm text-ink-900 lg:pl-[3.25rem]">
                        <span className="font-semibold">{formatMoney(h.ledger.dueMinor, h.currency)}</span> to pay ·{" "}
                        <Link href={payHref(h)} className={INLINE_LINK}>
                          Pay now
                        </Link>
                      </p>
                    ) : null}
                    {postpaid && h.ledger.nextDue ? (
                      <p className="nums mt-2 text-sm font-medium text-ink-900 lg:pl-[3.25rem]">
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

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 lg:contents">
                      <div className="nums">
                        <dt className={FIELD_LABEL}>{h.fullTime ? "Annual CTC" : "Monthly"}</dt>
                        <dd className="text-sm text-ink-900">
                          {h.fullTime ? (
                            h.annualCtcMinor != null ? formatMoney(h.annualCtcMinor, h.currency, { zeroLabel: false }) : "CTC not set"
                          ) : h.monthlyMinor != null ? (
                            <>
                              <span className="whitespace-nowrap">
                                {formatMoney(h.monthlyMinor, h.currency)}
                                <span className="text-ink-600"> / month</span>
                              </span>
                            </>
                          ) : (
                            "Not set"
                          )}
                        </dd>
                      </div>
                      <div className="nums order-last col-span-2 lg:order-none lg:col-span-1">
                        <dt className={FIELD_LABEL}>Period</dt>
                        <dd className="text-sm text-ink-900">
                          <span className="whitespace-nowrap">{h.fullTime ? `Joining ${h.startDate ? formatDate(h.startDate) : "to be agreed"}` : dateRange(h.startDate, h.ledger.endsOn)}</span>
                          {h.fullTime ? null : (
                            <span className="block text-sm text-ink-600">
                              {h.months} month{h.months === 1 ? "" : "s"}
                              {h.ledger.plan === "monthly" ? ` · ${h.ledger.monthsPaid} paid` : ""}
                            </span>
                          )}
                          {progress ? (
                            <span className="mt-1.5 block">
                              <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-ink-200">
                                <span className="block h-full rounded-full bg-brand-600" style={{ width: `${progress.pct}%` }} />
                              </span>
                              <span className="mt-1 block text-xs text-ink-600">{progress.note}</span>
                            </span>
                          ) : null}
                        </dd>
                      </div>
                      <div className="nums lg:text-right lg:tabular-nums">
                        <dt className={FIELD_LABEL}>Paid</dt>
                        <dd className="text-sm font-medium text-ink-900">
                          {formatMoney(h.ledger.paidMinor, h.currency, { zeroLabel: false })}
                          <span className="block whitespace-nowrap text-sm font-normal text-ink-600">
                            {h.fullTime ? "hiring fee" : fee > 0 ? `incl. ${formatMoney(fee, h.currency, { zeroLabel: false })} fee` : "\u00a0"}
                          </span>
                        </dd>
                      </div>
                  </dl>

                  <div className="mt-4 lg:mt-0">
                    <Pill tone={plan.tone} icon={<span aria-hidden className="!size-2 rounded-full bg-current" />}>{plan.label}</Pill>
                  </div>

                  {/* One visible action by state: Pay while money is due (it was
                      only reachable from the page header), else Timesheets, else
                      the contract; the rest are in the menu (QA-122). */}
                  <div className="mt-3 flex items-center gap-1 lg:mt-0 lg:justify-end">
                    {due ? (
                      <ButtonLink href={payHref(h)} variant="primary" size="sm">
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
          </ul>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
