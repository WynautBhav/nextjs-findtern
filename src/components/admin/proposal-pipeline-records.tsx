import Link from "next/link";
import { CalendarX2 } from "lucide-react";

import { DataTable, IdentityCell, parseSort } from "@/components/admin/data-table";
import { ProposalViewButton, PipelineCsvButton } from "@/components/admin/proposal-pipeline-drawer";
import { BUCKET_TONE, csvRowOf, drawerOf, nameOf, payOf, projectOf, typeOf, type PipelineItem } from "@/lib/admin/proposal-drawer-data";

import { StatusBadge, TONE_CLASS } from "@/components/admin/status-badge";
import { statValueClass } from "@/components/admin/stat-card-class";
import type { ToolbarFilter } from "@/components/admin/table-toolbar";
import {
  ACCEPTED_PAY_LABEL,
  PIPELINE_BUCKETS,
  PIPELINE_HINT,
  PIPELINE_LABEL,
  PIPELINE_TYPES,
  PIPELINE_TYPE_LABEL,
  isPpoOffer,
  parsePayFilter,
  parsePipelineStatus,
  parsePipelineType,
  pipelineByType,
  pipelineCsv,
  pipelineView,
  proposalTypeOf,
  type PipelineBucket,
} from "@/lib/admin/proposal-pipeline";
import { matchesSearch, paginate, sortBy } from "@/lib/admin/tracker";
import { formatDate, formatNumber } from "@/lib/format";
import { parseOffer } from "@/lib/offer";
import { cn } from "@/lib/utils";
import { toQueryString } from "@/lib/admin/params";
import { X } from "lucide-react";
import { HeatGuide } from "@/components/admin/heat/heat-guide";
import { HeatMark } from "@/components/admin/heat/heat-mark";
import { HEAT_LABEL } from "@/lib/admin/heat";
import { HEAT_BANDS, PROPOSAL_HEAT_GUIDE, heatBand, parseHeatBand, proposalHeat, sortByHeat } from "@/lib/admin/proposal-heat";

export { BUCKET_TONE, type PipelineItem };

/**
 * The Proposal pipeline's main view: seven KPI cards that filter the records table under them (`status=` in the URL), the
 * table itself, its CSV and the View drawer. Cards and table come from ONE array (pipelineView), after the page's date
 * range and pickers and this view's search, so a card's count is always the number of rows it shows.
 */

const BASE = "/admin/proposal-tracker";

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
  // Heat (proposal-heat.ts) on every row; open rows only, closed rows are null. The Heat filter narrows like search does,
  // before the type control and the cards, so every count above the table is still the rows it shows.
  const now = new Date();
  const heatFilter = parseHeatBand(params.heat);
  const searched = rows
    .filter((r) => matchesSearch([nameOf(r), r.internEmail, r.companyName, r.projectName, parseOffer(r.offerDetails, r.currency).roleTitle], search))
    .map((r) => ({ ...r, heat: proposalHeat({ bucket: r.bucket, pay: r.pay, offerDetails: r.offerDetails, currency: r.currency, createdAt: r.createdAt }, now) }))
    .filter((r) => !heatFilter || heatBand(r.heat) === heatFilter);
  // Type first (Internship | Full-time), then the outcome cards: each type segment counts what Total sent shows when picked.
  const type = parsePipelineType(params.type);
  const byType = pipelineByType(searched.map((r) => ({ ...r, type: proposalTypeOf(r.offerDetails, r.currency) })), type);
  // `pay=unpaid` comes only from the sidebar badge and the dashboard queue: a removable tag above the table, never on the Accepted card.
  const pay = status === "accepted" ? parsePayFilter(params.pay) : "";
  const view = pipelineView(byType.rows, status, pay);
  // Default order: hottest first, closed rows after them (newest first).
  const sort = parseSort(params, ["heat", "created", "candidate", "company"] as const, { key: "heat", dir: "desc" });
  const sorted =
    sort.key === "heat"
      ? sortByHeat(view.rows, sort.dir)
      : sortBy(
          view.rows,
          (r) => (sort.key === "candidate" ? nameOf(r).toLowerCase() : sort.key === "company" ? (r.companyName ?? "").toLowerCase() : r.createdAt ? r.createdAt.getTime() : null),
          sort.dir,
        );
  const pg = paginate(sorted, page, perPage);
  const csv = pipelineCsv(sorted.map((r) => ({ ...csvRowOf(r), heat: r.heat ? `${HEAT_LABEL[r.heat.level]} ${r.heat.score}: ${r.heat.why}` : "Closed" })));
  const filtersOn = Boolean(search || status || type || heatFilter || params.company || params.intern || params.tz || params.from || params.to);

  // The cards are one GET form: each is a real button that sets `status` (the pressed one clears it), keeping every other filter.
  const keep = ["from", "to", "company", "intern", "tz", "q", "sort", "dir", "per", "type", "heat"].filter((k) => params[k]);
  const cards: { key: PipelineBucket | ""; label: string; hint: string; n: number }[] = [
    { key: "", label: "Total sent", hint: PIPELINE_HINT.all, n: view.total },
    ...PIPELINE_BUCKETS.map((b) => ({ key: b, label: PIPELINE_LABEL[b], hint: PIPELINE_HINT[b], n: view.counts[b] })),
  ];
  const typeHref = (t: string) => `${BASE}${toQueryString({ ...params, type: t, page: "" })}`;
  const segments = [{ key: "", label: "All", n: byType.counts.all }, ...PIPELINE_TYPES.map((t) => ({ key: t as string, label: PIPELINE_TYPE_LABEL[t], n: byType.counts[t] }))];

  return (
    <div className="space-y-4">
      <nav aria-label="Proposal type" className="inline-flex w-full rounded-full bg-[color:var(--admin-panel-2)] p-1 sm:w-auto">
        {segments.map((t) => {
          const on = type === t.key;
          return (
            <Link
              key={t.key || "all"}
              href={typeHref(t.key)}
              aria-current={on ? "page" : undefined}
              data-testid={`pipeline-type-${t.key || "all"}`}
              className={cn(
                "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none sm:min-h-9 sm:flex-none sm:px-4",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                on ? "bg-[color:var(--admin-panel)] text-foreground shadow-[var(--admin-shadow)]" : "text-text-subtle hover:text-foreground",
              )}
            >
              {t.label}
              <span className="nums text-xs text-text-subtle">{formatNumber(t.n)}</span>
            </Link>
          );
        })}
      </nav>

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

      {/* What heat means sits right above the table; the waiting-on-payment tag (from the badge links) follows it. */}
      <div className="flex flex-col items-start gap-2">
        <HeatGuide guide={PROPOSAL_HEAT_GUIDE} className="w-full" />
        {pay ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-text-subtle">Filtered by</span>
            <Link
              href={`${BASE}${toQueryString({ ...params, pay: "", page: "" })}`}
              aria-label={`Remove filter: ${ACCEPTED_PAY_LABEL.unpaid.toLowerCase()}`}
              data-testid="pipeline-pay-tag"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[color:var(--admin-panel)] py-1 pl-3 pr-2 text-sm font-medium text-foreground shadow-[var(--admin-shadow)] transition-colors hover:bg-[color:var(--admin-panel-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-lg:min-h-11"
            >
              {ACCEPTED_PAY_LABEL.unpaid}
              <span className="nums text-text-subtle">{formatNumber(view.acceptedPay.unpaid)}</span>
              <X className="size-4 text-text-subtle" aria-hidden />
            </Link>
          </div>
        ) : null}
      </div>

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
        caption={[type ? PIPELINE_TYPE_LABEL[type] : "", status ? PIPELINE_LABEL[status].toLowerCase() : "sent", pay ? "proposals waiting on payment" : "proposals"].filter(Boolean).join(" ").replace(/^./, (c) => c.toUpperCase())}
        searchPlaceholder="Search name, company, role…"
        filters={[
          ...pickers,
          { key: "heat", label: "Heat", allLabel: "Any heat", options: HEAT_BANDS.map((b) => ({ value: b, label: b === "closed" ? "Closed" : HEAT_LABEL[b] })) },
        ]}
        extraControls={<PipelineCsvButton table={csv} filename={`proposals${type ? `-${type}` : ""}${status ? `-${status}` : ""}${pay ? `-${pay}` : ""}.csv`} />}
        empty={
          filtersOn
            ? { title: "Nothing matches", body: "No proposal fits this outcome, search and these filters.", action: { href: BASE, label: "Clear filters" } }
            : { title: "No proposals yet", body: "Proposals appear here the moment a company sends one." }
        }
        columns={[
          {
            header: "Heat",
            sort: "heat",
            firstDir: "desc",
            cell: (r) =>
              r.heat ? (
                <HeatMark heat={r.heat} id={r.id} compact />
              ) : (
                <span className="text-text-subtle" title="Closed: nothing to do">
                  –<span className="sr-only">Closed: nothing to do</span>
                </span>
              ),
          },
          {
            header: "Candidate",
            sort: "candidate",
            cell: (r) => <IdentityCell name={nameOf(r)} id={r.internId} href={`/admin/interns/${r.internId}`} sub={r.internEmail ?? "-"} size="sm" className="max-w-40" />,
          },
          {
            header: "Employer",
            sort: "company",
            cell: (r) => (
              <Link href={`/admin/companies/${r.employerId}`} className="block max-w-32 truncate font-medium text-foreground hover:underline" title={r.companyName ?? undefined}>
                {r.companyName ?? "Company"}
              </Link>
            ),
          },
          {
            // Project (else the offer's role) with the proposal type under it: one column keeps the table inside 1440.
            header: "Project and type",
            cell: (r) => (
              <div className="min-w-0 max-w-44">
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
