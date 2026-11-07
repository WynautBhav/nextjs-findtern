"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, CalendarCheck, CreditCard, Download, FileText } from "lucide-react";

import { EmptyScene, Pill, Surface } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { FullTimeOfferButton } from "@/components/employer/full-time-offer-button";
import { RowMenu } from "@/components/app/row-menu";
import { downloadCsv } from "@/lib/admin/csv";
import { formatDate, formatMoney } from "@/lib/format";
import { filterHires } from "@/lib/orders-filter";
import { todayIst } from "@/lib/offer";
import type { HireRow } from "./types";
import { PLAN, dateRange, SearchField, ResetButton, LiveCount, initials } from "./shared";

/* ── Hires ─────────────────────────────────────────────────────────── */

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
              <li key={h.proposalId} className="grid transition-colors hover:bg-ink-50/60 gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center">
                <div className="flex min-w-0 items-start gap-3.5">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800">
                    {initials(h.candidateName)}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/employer/intern/${encodeURIComponent(h.internId)}`}
                        className="break-words text-base font-medium text-ink-900 underline-offset-4 hover:text-brand-700 hover:underline touch:inline-flex touch:min-h-11 touch:items-center"
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

                <div className="min-w-0"><dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
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
                {h.ledger.totalMinor > 0 ? (
                  <div className="mt-3" role="img" aria-label={`${Math.round((h.ledger.paidMinor / h.ledger.totalMinor) * 100)}% paid`}>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, Math.round((h.ledger.paidMinor / h.ledger.totalMinor) * 100))}%` }} />
                    </div>
                  </div>
                ) : null}
                </div>

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

