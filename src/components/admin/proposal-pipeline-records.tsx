import Link from "next/link";
import { CalendarX2 } from "lucide-react";

import { DataTable, IdentityCell, parseSort } from "@/components/admin/data-table";
import { ProposalViewButton, PipelineCsvButton, type DrawerProposal } from "@/components/admin/proposal-pipeline-drawer";
import { StatusBadge, TONE_CLASS, type StatusTone } from "@/components/admin/status-badge";
import { statValueClass } from "@/components/admin/stat-card-class";
import type { ToolbarFilter } from "@/components/admin/table-toolbar";
import { proposalTimeline } from "@/lib/admin/proposal-timeline";
import {
  ACCEPTED_PAY,
  ACCEPTED_PAY_LABEL,
  PIPELINE_BUCKETS,
  PIPELINE_HINT,
  PIPELINE_LABEL,
  isPpoOffer,
  parsePayFilter,
  parsePipelineStatus,
  pipelineCsv,
  pipelinePay,
  pipelineView,
  type AcceptedPay,
  type PipelineBucket,
  type PipelineCsvRow,
} from "@/lib/admin/proposal-pipeline";
import { matchesSearch, paginate, sortBy } from "@/lib/admin/tracker";
import type { CgpaGate } from "@/lib/cgpa-verification";
import { formatDate, formatIstClock, formatNumber, formatSlotTime } from "@/lib/format";
import { parseOffer } from "@/lib/offer";
import { EXPIRY_LABEL, type ExpiryReason } from "@/lib/proposal-expiry";
import { cn } from "@/lib/utils";
import { toQueryString } from "@/lib/admin/params";
import { buttonClass } from "@/components/ui/button";

/**
 * The Proposal pipeline's main view: seven KPI cards that filter the records table under them (`status=` in the URL), the
 * table itself, its CSV and the View drawer. Cards and table come from ONE array (pipelineView), after the page's date
 * range and pickers and this view's search, so a card's count is always the number of rows it shows.
 */

export type PipelineItem = {
  id: string;
  /** The true status (expiry applied); `storedStatus` is what the database holds. */
  status: string;
  storedStatus?: string;
  flowType: string | null;
  currency: string | null;
  offerDetails: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
  hiredAt: Date | null;
  internId: string;
  internFirstName: string | null;
  internLastName: string | null;
  internEmail: string | null;
  internPhone: string | null;
  employerId: string;
  companyName: string | null;
  projectId: string;
  projectName: string | null;
  projectTimezone: string | null;
  bucket: PipelineBucket;
  /** Accepted only: waiting on the employer's payment, or the payment under way. */
  pay: AcceptedPay | null;
  expiryReason: ExpiryReason | null;
  interview: { id: string; status: string; createdAt: Date | null; slot: Date | null; timezone: string | null; meetingLink: string | null; isAi: boolean } | null;
  cgpaGate?: CgpaGate | null;
};

const BASE = "/admin/proposal-tracker";

export const BUCKET_TONE: Record<PipelineBucket, StatusTone> = {
  pending: "warning",
  accepted: "info",
  hired: "success",
  rejected: "danger",
  withdrawn: "neutral",
  expired: "neutral",
};

const nameOf = (r: PipelineItem) => `${r.internFirstName ?? ""} ${r.internLastName ?? ""}`.trim() || r.internEmail || "Candidate";
const typeOf = (r: PipelineItem) => (parseOffer(r.offerDetails, r.currency).fullTime ? "Full-time proposal" : "Internship proposal");
const projectOf = (r: PipelineItem) => r.projectName || parseOffer(r.offerDetails, r.currency).roleTitle || "-";
const payOf = (r: PipelineItem) => pipelinePay(r.offerDetails, r.currency).label;
/** "27 Nov 2026, 12:53 PM IST". */
const when = (d: Date | string | null | undefined) => (d ? `${formatDate(d)}, ${formatIstClock(d)}` : "-");

function csvRowOf(r: PipelineItem): PipelineCsvRow {
  return {
    candidate: nameOf(r),
    employer: r.companyName ?? "Company",
    project: projectOf(r),
    type: `${typeOf(r)}${isPpoOffer(r.offerDetails, r.currency) ? " (PPO)" : ""}`,
    outcome: PIPELINE_LABEL[r.bucket],
    created: formatDate(r.createdAt),
    pay: payOf(r),
  };
}

function drawerOf(r: PipelineItem): DrawerProposal {
  const iv = r.interview;
  return {
    id: r.id,
    candidate: nameOf(r),
    internId: r.internId,
    email: r.internEmail,
    phone: r.internPhone,
    company: r.companyName ?? "Company",
    employerId: r.employerId,
    project: projectOf(r),
    typeLabel: typeOf(r),
    ppo: isPpoOffer(r.offerDetails, r.currency),
    outcome: { label: PIPELINE_LABEL[r.bucket], tone: BUCKET_TONE[r.bucket], expired: r.bucket === "expired" },
    expiryLabel: r.expiryReason ? EXPIRY_LABEL[r.expiryReason] : null,
    flow: r.flowType === "interview_first" ? "Interview first" : "Direct offer",
    sent: when(r.createdAt),
    pay: pipelinePay(r.offerDetails, r.currency),
    offerDetails: r.offerDetails,
    currency: r.currency,
    steps: proposalTimeline({ status: r.storedStatus ?? r.status, createdAt: r.createdAt, updatedAt: r.updatedAt, hiredAt: r.hiredAt, offerDetails: r.offerDetails, interviewAt: iv?.createdAt ?? null }).map((s) => ({
      ...s,
      at: when(s.at),
    })),
    interview: iv
      ? {
          status: iv.status,
          booked: when(iv.createdAt),
          slot: iv.slot ? `${formatSlotTime(iv.slot, iv.timezone || "Asia/Kolkata")} (${iv.timezone || "Asia/Kolkata"})` : "Not picked yet",
          link: iv.meetingLink,
        }
      : null,
  };
}

export function ProposalRecords({
  params,
  page,
  perPage,
  search,
  pickers,
  rows,
}: {
  params: Record<string, string>;
  page: number;
  perPage: number;
  search: string;
  pickers: ToolbarFilter[];
  rows: PipelineItem[];
}) {
  const status = parsePipelineStatus(params.status);
  const searched = rows.filter((r) => matchesSearch([nameOf(r), r.internEmail, r.companyName, r.projectName, parseOffer(r.offerDetails, r.currency).roleTitle], search));
  const pay = status === "accepted" ? parsePayFilter(params.pay) : "";
  const view = pipelineView(searched, status, pay);
  const sort = parseSort(params, ["created", "candidate", "company"] as const, { key: "created", dir: "desc" });
  const sorted = sortBy(
    view.rows,
    (r) => (sort.key === "candidate" ? nameOf(r).toLowerCase() : sort.key === "company" ? (r.companyName ?? "").toLowerCase() : r.createdAt ? r.createdAt.getTime() : null),
    sort.dir,
  );
  const pg = paginate(sorted, page, perPage);
  const csv = pipelineCsv(sorted.map(csvRowOf));
  const filtersOn = Boolean(search || status || params.company || params.intern || params.tz || params.from || params.to);

  // The cards are one GET form: each is a real button that sets `status` (the pressed one clears it), keeping every other filter.
  const keep = ["from", "to", "company", "intern", "tz", "q", "sort", "dir", "per"].filter((k) => params[k]);
  const cards: { key: PipelineBucket | ""; label: string; hint: string; n: number }[] = [
    { key: "", label: "Total sent", hint: PIPELINE_HINT.all, n: view.total },
    ...PIPELINE_BUCKETS.map((b) => ({
      key: b,
      label: PIPELINE_LABEL[b],
      // The Accepted card names its two parts, so the badge's "waiting on payment" figure is visible here too.
      hint: b === "accepted" ? `${formatNumber(view.acceptedPay.unpaid)} unpaid · ${formatNumber(view.acceptedPay.processing)} paying` : PIPELINE_HINT[b],
      n: view.counts[b],
    })),
  ];
  const payHref = (p: AcceptedPay | "") => `${BASE}${toQueryString({ ...params, status: "accepted", pay: p, page: "" })}`;

  return (
    <div className="space-y-4">
      <form method="get" action={BASE} aria-label="Filter by outcome">
        {keep.map((k) => (
          <input key={k} type="hidden" name={k} value={params[k]} />
        ))}
        <div className="grid grid-cols-2 gap-[var(--admin-gap)] sm:grid-cols-4 xl:grid-cols-7">
          {cards.map((c) => {
            const on = status === c.key;
            return (
              <button
                key={c.key || "all"}
                type="submit"
                name="status"
                value={on && c.key ? "" : c.key}
                aria-pressed={on}
                data-testid={`pipeline-card-${c.key || "all"}`}
                className={cn(
                  "flex min-w-0 flex-col items-start rounded-[var(--radius-admin-card)] p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring xl:p-[var(--admin-pad-panel)]",
                  c.key === "" && "col-span-2 xl:col-span-1",
                  on
                    ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]"
                    : "border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] shadow-[var(--admin-shadow)] hover:bg-[color:var(--admin-panel-2)]",
                )}
              >
                <span className={cn("flex items-center gap-2 text-sm font-medium", on ? "text-[color:var(--admin-tile-ink)]" : "text-text-subtle")}>
                  {c.key ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_CLASS[BUCKET_TONE[c.key]].dot)} /> : null}
                  {c.label}
                </span>
                <span className={cn(statValueClass(false, on), "mt-3 text-[2rem] sm:text-[2.25rem] xl:text-[2rem] leading-none")}>{formatNumber(c.n)}</span>
                <span className={cn("mt-2 text-[0.8125rem] leading-snug", on ? "text-[color:var(--admin-tile-ink)]" : "text-text-subtle")}>{c.hint}</span>
              </button>
            );
          })}
        </div>
      </form>

      {status === "accepted" ? (
        <nav aria-label="Accepted offers by payment" className="flex flex-wrap gap-2">
          {[{ key: "" as const, label: "All accepted", n: view.counts.accepted }, ...ACCEPTED_PAY.map((k) => ({ key: k, label: ACCEPTED_PAY_LABEL[k], n: view.acceptedPay[k] }))].map((c) => (
            <Link
              key={c.key || "all"}
              href={payHref(c.key)}
              aria-current={pay === c.key ? "page" : undefined}
              className={cn(buttonClass({ variant: pay === c.key ? "primary" : "outline", size: "sm" }), "min-h-11 gap-2 max-sm:flex-1")}
            >
              {c.label}
              <span className="nums opacity-80">{formatNumber(c.n)}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <DataTable
        basePath={BASE}
        params={params}
        page={pg.page}
        pages={pg.pages}
        total={pg.total}
        perPage={perPage}
        rows={pg.rows}
        rowKey={(r) => r.id}
        noun="proposals"
        caption={status ? `${PIPELINE_LABEL[status]}${pay ? ` (${ACCEPTED_PAY_LABEL[pay].toLowerCase()})` : ""} proposals` : "Sent proposals"}
        searchPlaceholder="Search name, company, role…"
        filters={pickers}
        extraControls={<PipelineCsvButton table={csv} filename={`proposals${status ? `-${status}` : ""}${pay ? `-${pay}` : ""}.csv`} />}
        empty={
          filtersOn
            ? { title: "Nothing matches", body: "No proposal fits this outcome, search and these filters.", action: { href: BASE, label: "Clear filters" } }
            : { title: "No proposals yet", body: "Proposals appear here the moment a company sends one." }
        }
        columns={[
          {
            header: "Candidate",
            sort: "candidate",
            cell: (r) => <IdentityCell name={nameOf(r)} id={r.internId} href={`/admin/interns/${r.internId}`} sub={r.internEmail ?? "-"} size="sm" className="max-w-56" />,
          },
          {
            header: "Employer",
            sort: "company",
            cell: (r) => (
              <Link href={`/admin/companies/${r.employerId}`} className="block max-w-48 truncate font-medium text-foreground hover:underline" title={r.companyName ?? undefined}>
                {r.companyName ?? "Company"}
              </Link>
            ),
          },
          {
            // Project (else the offer's role) with the proposal type under it: one column keeps the table inside 1440.
            header: "Project and type",
            cell: (r) => (
              <div className="min-w-0 max-w-56">
                <span className="block truncate text-foreground" title={projectOf(r)}>
                  {projectOf(r)}
                </span>
                <span className="flex items-center gap-1.5 text-[0.8125rem] text-text-subtle">
                  {typeOf(r)}
                  {isPpoOffer(r.offerDetails, r.currency) ? (
                    <abbr title="Pre-placement offer" className="rounded-md bg-ink-100 px-1.5 text-xs font-medium text-ink-700 no-underline">
                      PPO
                    </abbr>
                  ) : null}
                </span>
              </div>
            ),
          },
          {
            header: "Outcome",
            cell: (r) => <StatusBadge tone={BUCKET_TONE[r.bucket]} label={PIPELINE_LABEL[r.bucket]} icon={r.bucket === "expired" ? <CalendarX2 /> : undefined} />,
          },
          { header: "Created", sort: "created", cell: (r) => <span className="nums whitespace-nowrap">{formatDate(r.createdAt)}</span> },
          { header: "Pay", numeric: true, cell: (r) => <span className="whitespace-nowrap">{payOf(r)}</span> },
          { header: "", cell: (r) => <ProposalViewButton proposal={drawerOf(r)} /> },
        ]}
      />
    </div>
  );
}
