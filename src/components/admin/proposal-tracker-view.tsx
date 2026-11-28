import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { isHiredProposal } from "@/lib/hire-status";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { DataTable, IdentityCell, parseSort } from "@/components/admin/data-table";
import { AdminEmpty, Panel } from "@/components/admin/panel";
import { ProposalRecords, type PipelineItem } from "@/components/admin/proposal-pipeline-records";
import { StatusBadge } from "@/components/admin/status-badge";
import type { ToolbarFilter } from "@/components/admin/table-toolbar";
import { toQueryString } from "@/lib/admin/params";
import { daysSince } from "@/lib/admin/ai-interview-expiry";
import { EXPIRED_REASONS, HEADLINE_REASONS, expiredCounts, filterExpired, headlineCount, matchesSearch, offerFacts, paginate, sortBy, type ExpiredRow } from "@/lib/admin/tracker";
import { EXPIRY_LABEL, type ExpiryReason } from "@/lib/proposal-expiry";
import { formatDate, formatIstStamp, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { acceptanceRate, proposalOutcome } from "@/lib/proposals";

/**
 * The proposal pipeline's views. Server-rendered from rows the page has already filtered by date, company, candidate and
 * timezone; each view applies its own search, filters, sort and page, all from the URL. The main view is the records
 * table under the KPI cards (proposal-pipeline-records.tsx).
 */

// `interviews` stays a valid key so old links land on the "moved" note instead of the main view.
export const TRACKER_TABS = ["proposals", "candidates", "companies", "expired", "interviews"] as const;
export type TrackerTab = (typeof TRACKER_TABS)[number];

type ProposalItem = PipelineItem;

type InterviewItem = { employerId: string };

type EmployerItem = { id: string; companyName: string; companyEmail: string; city: string | null; country: string | null; isActive: boolean };
type Option = { value: string; label: string };

const BASE = "/admin/proposal-tracker";

const nameOf = (r: { internFirstName: string | null; internLastName: string | null; internEmail: string | null }) =>
  `${r.internFirstName ?? ""} ${r.internLastName ?? ""}`.trim() || r.internEmail || "Candidate";
const time = (d: Date | null) => (d ? d.getTime() : null);

export function ProposalTrackerView({
  tab,
  params,
  page,
  perPage,
  search,
  employers,
  proposals,
  interviews,
  noGuarantee,
  expired,
  options,
}: {
  tab: TrackerTab;
  params: Record<string, string>;
  page: number;
  perPage: number;
  search: string;
  employers: EmployerItem[];
  proposals: ProposalItem[];
  interviews: InterviewItem[];
  /** Intern ids with an ended guarantee (same function as the intern's offer page). */
  noGuarantee: Set<string>;
  /** Expired offers after the date range (by expiry) and the company / candidate / timezone pickers; the tab applies reason, search, sort and page. */
  expired: ExpiredRow[];
  options: { companies: Option[]; interns: Option[]; timezones: Option[] };
}) {
  const candidateIds = new Set(proposals.map((p) => p.internId));
  const activeCompanies = employers.filter((e) => proposals.some((p) => p.employerId === e.id) || interviews.some((i) => i.employerId === e.id));

  const tabs: { key: TrackerTab; label: string; count: number }[] = [
    { key: "proposals", label: "Proposals", count: proposals.length },
    { key: "candidates", label: "By candidate", count: candidateIds.size },
    { key: "companies", label: "By company", count: activeCompanies.length },
    // Headline = the three offers that lapsed on their own; closures by a person are chips inside the tab.
    { key: "expired", label: "Expired reasons", count: headlineCount(expiredCounts(expired)) },
  ];

  // Shared pickers (ADP-12): exact company, exact candidate, timezone.
  const pickers: ToolbarFilter[] = [
    { key: "company", label: "Company", allLabel: "All companies", options: options.companies },
    { key: "intern", label: "Candidate", allLabel: "All candidates", options: options.interns },
    { key: "tz", label: "Timezone", allLabel: "All timezones", options: options.timezones },
  ];
  // Tab changes keep the pickers and dates, and drop the per-tab state.
  const keep = { from: params.from ?? "", to: params.to ?? "", company: params.company ?? "", intern: params.intern ?? "", tz: params.tz ?? "" };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-x-6 gap-y-1 xl:flex-row xl:items-end xl:justify-between">
        <AdminTabs
          label="Pipeline view"
          className="min-w-0 xl:flex-1"
          items={tabs.map((t) => ({ ...t, href: `${BASE}${toQueryString({ ...keep, tab: t.key === "proposals" ? "" : t.key })}` }))}
          active={tab}
        />
        <Link
          href="/admin/meetings"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Meetings moved to Meeting pipeline
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {tab === "proposals" ? <ProposalRecords {...{ params, page, perPage, search, pickers }} rows={proposals} /> : null}
      {tab === "companies" ? <CompaniesTab {...{ params, page, perPage, search, pickers, proposals, interviews }} employers={activeCompanies} /> : null}
      {tab === "candidates" ? <CandidatesTab {...{ params, page, perPage, search, pickers, proposals, noGuarantee }} /> : null}
      {tab === "expired" ? <ExpiredTab {...{ params, page, perPage, search, pickers }} rows={expired} /> : null}
      {tab === "interviews" ? (
        <Panel>
          <AdminEmpty
            title="Meetings moved to Meeting pipeline"
            body="Interviews and meetings now have their own page, with the same company and candidate filters."
            action={{ href: "/admin/meetings", label: "Open Meeting pipeline" }}
          />
        </Panel>
      ) : null}
    </div>
  );
}

type TabProps = { params: Record<string, string>; page: number; perPage: number; search: string; pickers: ToolbarFilter[] };

const filteredEmpty = (params: Record<string, string>, tab: TrackerTab) => ({
  title: "Nothing matches",
  body: "No row matches this search and these filters. Clear them to see everything in this tab.",
  action: { href: `${BASE}?tab=${tab}`, label: "Clear filters" },
});

function CompaniesTab({
  params,
  page,
  perPage,
  search,
  pickers,
  employers,
  proposals,
  interviews,
}: TabProps & { employers: EmployerItem[]; proposals: ProposalItem[]; interviews: InterviewItem[] }) {
  const rows = employers
    .filter((e) => matchesSearch([e.companyName, e.companyEmail, e.city, e.country], search))
    .map((e) => {
      const mine = proposals.filter((p) => p.employerId === e.id);
      const won = mine.filter((p) => proposalOutcome(p.status) === "won").length;
      const lost = mine.filter((p) => proposalOutcome(p.status) === "lost").length;
      return {
        ...e,
        proposals: mine.length,
        interviews: interviews.filter((i) => i.employerId === e.id).length,
        hired: mine.filter((p) => isHiredProposal(p)).length,
        won,
        lost,
        rate: acceptanceRate(won, lost),
      };
    });
  const sort = parseSort(params, ["name", "proposals", "interviews", "hired", "rate"] as const, { key: "proposals", dir: "desc" });
  const sorted = sortBy(rows, (r) => (sort.key === "name" ? r.companyName.toLowerCase() : r[sort.key]), sort.dir);
  const pg = paginate(sorted, page, perPage);
  const q = (company: string) => `${BASE}${toQueryString({ from: params.from ?? "", to: params.to ?? "", company })}`;

  return (
    <DataTable
      basePath={BASE}
      params={params}
      page={pg.page}
      pages={pg.pages}
      total={pg.total}
      perPage={perPage}
      rows={pg.rows}
      noun="companies"
      caption="Companies in the pipeline"
      searchPlaceholder="Search company, email, city…"
      filters={pickers.filter((f) => f.key !== "intern")}
      empty={search || params.company || params.tz ? filteredEmpty(params, "companies") : { title: "No hiring activity", body: "Companies appear here once they send a proposal or ask for an interview." }}
      columns={[
        {
          header: "Company",
          sort: "name",
          cell: (r) => (
            <Link href={`/admin/companies/${r.id}`} className="group block min-w-0 max-w-64">
              <p className="truncate font-medium text-foreground group-hover:underline">{r.companyName}</p>
              <p className="truncate text-xs text-text-subtle">{[r.city, r.country].filter(Boolean).join(", ") || r.companyEmail}</p>
            </Link>
          ),
        },
        {
          header: "Proposals",
          sort: "proposals",
          align: "right",
          cell: (r) => (
            <Link href={q(r.id)} className="font-medium hover:underline">
              {r.proposals}
            </Link>
          ),
        },
        {
          header: "Interviews",
          sort: "interviews",
          align: "right",
          // Meetings live on the Meeting pipeline now; the count stays for the company's picture.
          cell: (r) => r.interviews,
        },
        { header: "Accepted or hired", align: "right", cell: (r) => r.won },
        { header: "Hired", sort: "hired", align: "right", cell: (r) => r.hired },
        { header: "Declined", align: "right", cell: (r) => r.lost },
        { header: "Acceptance", sort: "rate", align: "right", cell: (r) => (r.rate === null ? <span className="text-text-subtle">-</span> : `${r.rate}%`) },
        { header: "Account", cell: (r) => <StatusBadge value={r.isActive ? "active" : "inactive"} /> },
      ]}
    />
  );
}

function CandidatesTab({ params, page, perPage, search, pickers: basePickers, proposals, noGuarantee }: TabProps & { proposals: ProposalItem[]; noGuarantee: Set<string> }) {
  const pickers: ToolbarFilter[] = [...basePickers, { key: "guarantee", label: "Guarantee", allLabel: "Any guarantee", options: [{ value: "ended", label: "Not eligible" }] }];
  const byIntern = new Map<string, { internId: string; name: string; email: string | null; phone: string | null; received: number; won: number; lost: number; open: number; companies: string[]; last: Date | null }>();
  for (const p of proposals) {
    const row = byIntern.get(p.internId) ?? { internId: p.internId, name: nameOf(p), email: p.internEmail, phone: p.internPhone, received: 0, won: 0, lost: 0, open: 0, companies: [], last: null };
    row.received += 1;
    row[proposalOutcome(p.status)] += 1;
    const company = p.companyName ?? "Company";
    if (!row.companies.includes(company)) row.companies.push(company);
    if (p.createdAt && (!row.last || p.createdAt > row.last)) row.last = p.createdAt;
    byIntern.set(p.internId, row);
  }
  const rows = [...byIntern.values()].filter((c) => matchesSearch([c.name, c.email, c.phone, ...c.companies], search) && (params.guarantee !== "ended" || noGuarantee.has(c.internId)));
  const sort = parseSort(params, ["name", "received", "won", "last"] as const, { key: "received", dir: "desc" });
  const sorted = sortBy(rows, (r) => (sort.key === "name" ? r.name.toLowerCase() : sort.key === "last" ? time(r.last) : r[sort.key]), sort.dir);
  const pg = paginate(sorted, page, perPage);

  return (
    <DataTable
      basePath={BASE}
      params={params}
      page={pg.page}
      pages={pg.pages}
      total={pg.total}
      perPage={perPage}
      rows={pg.rows}
      noun="candidates"
      caption="Candidates who received proposals"
      searchPlaceholder="Search candidate, email, phone, company…"
      filters={pickers}
      empty={search || params.company || params.intern || params.tz || params.guarantee ? filteredEmpty(params, "candidates") : { title: "No candidates yet", body: "Candidates appear here once a company sends them an offer." }}
      columns={[
        {
          header: "Candidate",
          sort: "name",
          cell: (c) => (
            <IdentityCell name={c.name} id={c.internId} href={`/admin/interns/${c.internId}`} sub={c.email ?? "-"} size="sm" className="max-w-64" />
          ),
        },
        { header: "Phone", cell: (c) => <span className="nums whitespace-nowrap">{c.phone ?? "-"}</span> },
        { header: "Received", sort: "received", align: "right", cell: (c) => c.received },
        { header: "Accepted or hired", sort: "won", align: "right", cell: (c) => c.won },
        { header: "Declined", align: "right", cell: (c) => c.lost },
        { header: "Open", align: "right", cell: (c) => c.open },
        { header: "Guarantee", cell: (c) => (noGuarantee.has(c.internId) ? <span className="whitespace-nowrap text-warning">Not eligible for guarantee</span> : "Eligible") },
        {
          header: "From",
          cell: (c) => (
            <span className="block max-w-64 truncate" title={c.companies.join(", ")}>
              {c.companies.join(", ")}
            </span>
          ),
        },
        { header: "Last offer", sort: "last", cell: (c) => <span className="nums whitespace-nowrap">{formatDate(c.last)}</span> },
      ]}
    />
  );
}

/** "View proposal" on a table row: the read-only proposal page (same read permission as this pipeline). */
function ViewProposalLink({ id }: { id: string }) {
  return (
    <Link href={`/admin/proposal-tracker/${encodeURIComponent(id)}`} className="whitespace-nowrap text-sm font-medium text-brand-700 hover:underline max-lg:inline-flex max-lg:min-h-11 max-lg:items-center">
      View proposal
    </Link>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Expired: offers that lapsed or were closed (rules and the one definition: lib/admin/tracker.ts expiredProposals).
// ---------------------------------------------------------------------------------------------------------------

const REASON_SHORT: Record<ExpiryReason, string> = {
  no_reply_past_start: "No reply",
  unpaid_past_start: "Not paid",
  accepted_elsewhere: "Accepted elsewhere",
  admin_closed: "Closed by Findtern",
  withdrawn: "Withdrawn",
};
// A lapse that cost a hire is red; a closure someone chose is neutral.
const REASON_TONE = { no_reply_past_start: "warning", unpaid_past_start: "danger", accepted_elsewhere: "neutral", admin_closed: "neutral", withdrawn: "neutral" } as const;

function ExpiredTab({ params, page, perPage, search, pickers, rows }: TabProps & { rows: ExpiredRow[] }) {
  const reason = (EXPIRED_REASONS as string[]).includes(params.reason ?? "") ? (params.reason as ExpiryReason) : null;
  // Counts come from the rows before reason and search, so a chip never hides its own siblings.
  const counts = expiredCounts(rows);
  const now = new Date();
  const filtered = filterExpired(rows, { reason: reason ?? "", q: search, company: "", intern: "", tz: "", since: null, until: null });
  const sort = parseSort(params, ["candidate", "company", "start", "expired"] as const, { key: "expired", dir: "desc" });
  const sorted = sortBy(
    filtered,
    (r) =>
      sort.key === "candidate"
        ? nameOf(r).toLowerCase()
        : sort.key === "company"
          ? (r.companyName ?? "").toLowerCase()
          : sort.key === "start"
            ? offerFacts(r).startDay
            : time(r.at),
    sort.dir,
  );
  const pg = paginate(sorted, page, perPage);
  const chipHref = (r: ExpiryReason | null) => `${BASE}${toQueryString({ ...params, tab: "expired", reason: r ?? "", page: "" })}`;
  const chips: { key: ExpiryReason | null; label: string; n: number }[] = [
    { key: null, label: "All reasons", n: rows.length },
    ...EXPIRED_REASONS.map((r) => ({ key: r, label: REASON_SHORT[r], n: counts[r] })),
  ];
  const lapsed = headlineCount(counts);
  const filtersOn = Boolean(search || reason || params.company || params.intern || params.tz || params.from || params.to);

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-subtle" data-testid="expired-summary">
        <span className="nums font-medium text-foreground">{formatNumber(lapsed)}</span> expired ({HEADLINE_REASONS.map((r) => `${formatNumber(counts[r])} ${REASON_SHORT[r].toLowerCase()}`).join(", ")}). Closed by hand, not counted as expired:{" "}
        <span className="nums">{formatNumber(counts.admin_closed)}</span> by Findtern, <span className="nums">{formatNumber(counts.withdrawn)}</span> withdrawn, so the list below is longer. An offer past its start date that has not been marked yet still shows, dated at the start of that day (India time).
      </p>
      <nav aria-label="Expiry reason" className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const on = (reason ?? null) === c.key;
          return (
            <Link
              key={c.key ?? "all"}
              href={chipHref(c.key)}
              aria-current={on ? "page" : undefined}
              className={cn(buttonClass({ variant: on ? "primary" : "outline", size: "sm" }), "min-h-11 gap-2 max-sm:flex-1")}
            >
              {c.label}
              <span className="nums opacity-80">{formatNumber(c.n)}</span>
            </Link>
          );
        })}
      </nav>
      <DataTable
        basePath={BASE}
        params={params}
        page={pg.page}
        pages={pg.pages}
        total={pg.total}
        perPage={perPage}
        rows={pg.rows}
        rowKey={(r) => r.id}
        noun="expired offers"
        caption="Expired offers"
        searchPlaceholder="Search candidate, company, project…"
        filters={pickers}
        empty={
          filtersOn
            ? { title: "No expired offers match", body: "Nothing expired fits this reason, search and these filters.", action: { href: `${BASE}?tab=expired`, label: "Clear filters" } }
            : { title: "No expired offers", body: "Offers that go unanswered or unpaid past their start date, or that are closed or withdrawn, are listed here." }
        }
        columns={[
          {
            header: "Reason",
            cell: (r) => <StatusBadge tone={REASON_TONE[r.reason]} label={EXPIRY_LABEL[r.reason]} className="h-auto min-h-6 max-w-44 whitespace-normal py-1 leading-snug" />,
          },
          {
            header: "Candidate",
            sort: "candidate",
            cell: (r) => <IdentityCell name={nameOf(r)} id={r.internId} href={`/admin/interns/${r.internId}`} sub={r.internEmail ?? "-"} size="sm" className="min-w-0" />,
          },
          {
            header: "Company and project",
            sort: "company",
            cell: (r) => (
              <div className="min-w-0">
                <Link href={`/admin/companies/${r.employerId}`} className="line-clamp-2 break-words font-medium text-foreground hover:underline" title={r.companyName ?? undefined}>
                  {r.companyName ?? "Company"}
                </Link>
                <p className="line-clamp-2 break-words text-xs text-text-subtle" title={r.projectName ?? undefined}>
                  {r.projectName ?? "Project"}
                </p>
              </div>
            ),
          },
          {
            header: "Offer and start",
            sort: "start",
            cell: (r) => {
              const f = offerFacts(r);
              return (
                <div>
                  <p className="nums font-medium text-foreground">{f.amountMinor == null ? "-" : `${formatMoney(f.amountMinor, f.currency)}${f.fullTime ? " CTC" : "/mo"}`}</p>
                  <p className="nums text-xs text-text-subtle">
                    {f.fullTime ? "Full-time" : `${f.months} mo`} · starts {formatDate(f.startDay)}
                  </p>
                </div>
              );
            },
          },
          {
            header: "Expired",
            sort: "expired",
            cell: (r) => {
              const d = daysSince(r.at, now);
              return r.at ? (
                <div>
                  <p className="nums text-foreground" title={`${formatIstStamp(r.at)} IST`}>
                    {r.atApprox ? "about " : ""}
                    {formatDate(r.at)}
                  </p>
                  <p className="text-xs text-text-subtle">
                    {d === 0 ? "today" : `${d} ${d === 1 ? "day" : "days"} ago`}
                    {r.persisted ? "" : " · not swept yet"}
                  </p>
                </div>
              ) : (
                <span className="text-text-subtle">Unknown</span>
              );
            },
          },
          { header: "", cell: (r) => <ViewProposalLink id={r.id} /> },
        ]}
      />
    </div>
  );
}
