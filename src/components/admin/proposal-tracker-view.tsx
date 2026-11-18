import Link from "next/link";

import { FilterTabs } from "@/components/app/primitives";
import { DataTable, IdentityCell, parseSort } from "@/components/admin/data-table";
import { PIPELINE_STAGES, ProposalStageNav, inLane, parseLane } from "@/components/admin/proposal-stages";
import { ProposalDetailsButton } from "@/components/admin/proposal-tracker-dialogs";
import { InterviewNotesButton, MeetingLinkCell } from "@/components/admin/proposal-tracker-dialogs";
import { StatusBadge } from "@/components/admin/status-badge";
import type { ToolbarFilter } from "@/components/admin/table-toolbar";
import { toQueryString } from "@/lib/admin/params";
import { daysSince } from "@/lib/admin/ai-interview-expiry";
import { EXPIRED_REASONS, HEADLINE_REASONS, expiredCounts, filterExpired, headlineCount, matchesSearch, offerFacts, paginate, sortBy, type ExpiredRow } from "@/lib/admin/tracker";
import { EXPIRY_LABEL, type ExpiryReason } from "@/lib/proposal-expiry";
import { formatDate, formatIstStamp, formatMoney, formatNumber, formatSlotTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { parseOffer } from "@/lib/offer";
import { acceptanceRate, proposalOutcome } from "@/lib/proposals";

/**
 * The proposal pipeline's five lists. Server-rendered from rows the page has
 * already filtered by date, company, candidate and timezone; this applies
 * the per-tab search, status filters, sort and page, all from the URL.
 */

// Proposals first: the work itself; Companies is a rollup of it.
export const TRACKER_TABS = ["proposals", "candidates", "interviews", "hired", "expired", "companies"] as const;
export type TrackerTab = (typeof TRACKER_TABS)[number];

type ProposalItem = {
  id: string;
  status: string;
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
};

type InterviewItem = {
  id: string;
  status: string;
  slot1: Date | null;
  slot2: Date | null;
  slot3: Date | null;
  selectedSlot: number | null;
  timezone: string | null;
  meetingLink: string | null;
  notes: string | null;
  createdAt: Date | null;
  internId: string;
  internFirstName: string | null;
  internLastName: string | null;
  internEmail: string | null;
  employerId: string;
  companyName: string | null;
  projectId: string | null;
  projectName: string | null;
  isAi: boolean;
};

type EmployerItem = { id: string; companyName: string; companyEmail: string; city: string | null; country: string | null; isActive: boolean };
type Option = { value: string; label: string };

const BASE = "/admin/proposal-tracker";
const FINISHED_INTERVIEW = ["completed", "expired", "cancelled", "canceled"];

const nameOf = (r: { internFirstName: string | null; internLastName: string | null; internEmail: string | null }) =>
  `${r.internFirstName ?? ""} ${r.internLastName ?? ""}`.trim() || r.internEmail || "Candidate";
const time = (d: Date | null) => (d ? d.getTime() : null);
const chosenSlot = (i: InterviewItem) => (i.selectedSlot === 1 ? i.slot1 : i.selectedSlot === 2 ? i.slot2 : i.selectedSlot === 3 ? i.slot3 : null);

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
  const hired = proposals.filter((p) => p.status === "hired");
  const candidateIds = new Set(proposals.map((p) => p.internId));
  const activeCompanies = employers.filter((e) => proposals.some((p) => p.employerId === e.id) || interviews.some((i) => i.employerId === e.id));

  const tabs: { key: TrackerTab; label: string; count: number }[] = [
    { key: "proposals", label: "Proposals", count: proposals.length },
    { key: "candidates", label: "Candidates", count: candidateIds.size },
    { key: "interviews", label: "Interviews", count: interviews.length },
    { key: "hired", label: "Hired", count: hired.length },
    // Headline = the three offers that lapsed on their own; closures by a person are chips inside the tab.
    { key: "expired", label: "Expired", count: headlineCount(expiredCounts(expired)) },
    { key: "companies", label: "Companies", count: activeCompanies.length },
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
      <div className="border-b border-ink-200 pb-3">
        <FilterTabs label="Pipeline view" tabs={tabs} value={tab} hrefFor={(k) => `${BASE}${toQueryString({ ...keep, tab: k })}`} />
      </div>

      {tab === "companies" ? <CompaniesTab {...{ params, page, perPage, search, pickers, proposals, interviews }} employers={activeCompanies} /> : null}
      {tab === "proposals" ? <ProposalsTab {...{ params, page, perPage, search, pickers }} rows={proposals} /> : null}
      {tab === "candidates" ? <CandidatesTab {...{ params, page, perPage, search, pickers, proposals, noGuarantee }} /> : null}
      {tab === "interviews" ? <InterviewsTab {...{ params, page, perPage, search, pickers }} rows={interviews} /> : null}
      {tab === "hired" ? <HiredTab {...{ params, page, perPage, search, pickers }} rows={hired} /> : null}
      {tab === "expired" ? <ExpiredTab {...{ params, page, perPage, search, pickers }} rows={expired} /> : null}
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
        hired: mine.filter((p) => p.status === "hired").length,
        won,
        lost,
        rate: acceptanceRate(won, lost),
      };
    });
  const sort = parseSort(params, ["name", "proposals", "interviews", "hired", "rate"] as const, { key: "proposals", dir: "desc" });
  const sorted = sortBy(rows, (r) => (sort.key === "name" ? r.companyName.toLowerCase() : r[sort.key]), sort.dir);
  const pg = paginate(sorted, page, perPage);
  const q = (company: string, tab: TrackerTab) => `${BASE}${toQueryString({ from: params.from ?? "", to: params.to ?? "", company, tab })}`;

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
            <Link href={q(r.id, "proposals")} className="font-medium hover:underline">
              {r.proposals}
            </Link>
          ),
        },
        {
          header: "Interviews",
          sort: "interviews",
          align: "right",
          cell: (r) => (
            <Link href={q(r.id, "interviews")} className="font-medium hover:underline">
              {r.interviews}
            </Link>
          ),
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

function ProposalsTab({ params, page, perPage, search, pickers, rows }: TabProps & { rows: ProposalItem[] }) {
  const lane = parseLane(params.lane);
  const now = new Date();
  // Counts for the stage list come from the period's rows, before search and the kind filter, so a stage never hides its siblings.
  const statuses = rows.map((p) => p.status);
  const filtered = rows.filter((p) => {
    const offer = parseOffer(p.offerDetails, p.currency);
    return (
      inLane(lane, p.status) &&
      matchesSearch([nameOf(p), p.internEmail, p.companyName, p.projectName, offer.roleTitle], search) &&
      (!params.flow || p.flowType === params.flow) &&
      (!params.kind || (params.kind === "fulltime" ? Boolean(offer.fullTime) : !offer.fullTime))
    );
  });
  // A work queue reads oldest first; a finished stage reads newest first.
  const sort = parseSort(params, ["stage", "candidate", "company", "start"] as const, { key: "stage", dir: lane === "hired" || lane === "closed" || lane === "all" ? "desc" : "asc" });
  const sorted = sortBy(
    filtered,
    (p) =>
      sort.key === "candidate"
        ? nameOf(p).toLowerCase()
        : sort.key === "company"
          ? (p.companyName ?? "").toLowerCase()
          : sort.key === "start"
            ? parseOffer(p.offerDetails, p.currency).startDate
            : time(p.updatedAt ?? p.createdAt),
    sort.dir,
  );
  const pg = paginate(sorted, page, perPage);
  const filtersOn = Boolean(search || params.flow || params.kind || params.company || params.intern || params.tz);
  const laneLabel = lane === "open" ? "open" : lane === "all" ? "" : PIPELINE_STAGES.find((s) => s.key === lane)?.label.toLowerCase() ?? "";

  const filters: ToolbarFilter[] = [
    ...pickers,
    { key: "flow", label: "Flow", options: [{ value: "direct", label: "Direct offer" }, { value: "interview_first", label: "Interview first" }] },
    { key: "kind", label: "Offer type", options: [{ value: "internship", label: "Internship" }, { value: "fulltime", label: "Full-time" }] },
  ];
  const empty = filtersOn
    ? filteredEmpty(params, "proposals")
    : lane === "open"
      ? rows.length === 0
        ? { title: "No proposals yet", body: "Offers appear here the moment a company sends one." }
        : { title: "Nothing is waiting", body: "Every proposal in this period has been decided. Look at the hires or the closed offers.", action: { href: `${BASE}${toQueryString({ ...params, tab: "proposals", lane: "all", page: "" })}`, label: "Show all proposals" } }
      : { title: `No ${laneLabel || ""} proposals`.replace("  ", " "), body: "Nothing sits in this stage for the current period.", action: { href: `${BASE}?tab=proposals`, label: "Back to the open queue" } };

  const queueHeader = (label: string) => <span>{label}</span>;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[11.5rem_minmax(0,1fr)] lg:gap-6">
      <ProposalStageNav statuses={statuses} lane={lane} params={params} basePath={BASE} />
      <DataTable
        basePath={BASE}
        params={params}
        page={pg.page}
        pages={pg.pages}
        total={pg.total}
        perPage={perPage}
        rows={pg.rows}
        rowKey={(p) => p.id}
        noun="proposals"
        caption={`Proposals, ${lane === "open" ? "open ones first, oldest at the top" : "by stage"}`}
        searchPlaceholder="Search candidate, company, project, role…"
        filters={filters}
        stickyHeader
        empty={empty}
        columns={[
          {
            header: queueHeader("In stage"),
            label: "In stage",
            sort: "stage",
            firstDir: "asc",
            cell: (p) => {
              const d = daysSince(p.updatedAt ?? p.createdAt, now);
              return (
                <div className="whitespace-nowrap">
                  <p className="nums whitespace-nowrap font-display text-base font-semibold text-foreground">{d === null ? "-" : d === 0 ? "Today" : `${d} ${d === 1 ? "day" : "days"}`}</p>
                  <p className="nums whitespace-nowrap text-xs text-text-subtle">since {formatDate(p.updatedAt ?? p.createdAt)}</p>
                </div>
              );
            },
          },
          {
            header: "Candidate",
            sort: "candidate",
            cell: (p) => <IdentityCell name={nameOf(p)} id={p.internId} href={`/admin/interns/${p.internId}`} sub={p.internEmail ?? "-"} size="sm" className="max-w-36" />,
          },
          {
            header: "Company and project",
            sort: "company",
            cell: (p) => (
              <div className="min-w-0 max-w-36">
                <Link href={`/admin/companies/${p.employerId}`} className="block truncate font-medium text-foreground hover:underline">
                  {p.companyName ?? "Company"}
                </Link>
                <p className="truncate text-xs text-text-subtle">{p.projectName ?? "Project"}</p>
              </div>
            ),
          },
          {
            header: "Offer",
            sort: "start",
            cell: (p) => {
              const o = parseOffer(p.offerDetails, p.currency);
              return (
                <div className="whitespace-nowrap">
                  <p className="nums whitespace-nowrap font-medium text-foreground">
                    {o.fullTime
                      ? `${o.fullTime.annualCtcMinor != null ? formatMoney(o.fullTime.annualCtcMinor, o.currency) : "-"} CTC`
                      : o.monthlyMinor != null
                        ? `${formatMoney(o.monthlyMinor, o.currency)}/mo`
                        : "-"}
                  </p>
                  <p className="nums whitespace-nowrap text-xs text-text-subtle">
                    {o.fullTime ? "Full-time" : `${o.months} mo`} · starts {formatDate(o.startDate)}
                  </p>
                </div>
              );
            },
          },
          {
            header: "Stage",
            cell: (p) => {
              const fullTimeHired = p.status === "hired" && Boolean(parseOffer(p.offerDetails, p.currency).fullTime);
              return (
                <div className="flex flex-col items-start gap-1">
                  {fullTimeHired ? <StatusBadge tone="success" label="Full-time hired" /> : <StatusBadge value={p.status} />}
                  <span className="text-xs text-text-subtle">{p.flowType === "interview_first" ? "Interview first" : "Direct offer"}</span>
                </div>
              );
            },
          },
          {
            header: <span className="sr-only">Actions</span>,
            label: "",
            cell: (p) => {
              const o = parseOffer(p.offerDetails, p.currency);
              const flow = p.flowType === "interview_first" ? "Interview first" : "Direct offer";
              return (
                <div className="flex justify-end">
                  <ProposalDetailsButton
                    proposal={{
                      id: p.id,
                      status: p.status,
                      currency: p.currency,
                      offerDetails: p.offerDetails,
                      candidate: nameOf(p),
                      companyName: p.companyName ?? "Company",
                      projectName: p.projectName ?? o.roleTitle ?? "Project",
                      flow,
                      sentAt: formatDate(p.createdAt),
                    }}
                  />
                </div>
              );
            },
          },
        ]}
      />
    </div>
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

function InterviewsTab({ params, page, perPage, search, pickers, rows }: TabProps & { rows: InterviewItem[] }) {
  const filtered = rows.filter(
    (i) => matchesSearch([nameOf(i), i.internEmail, i.companyName, i.projectName], search) && (!params.status || i.status === params.status),
  );
  const sort = parseSort(params, ["candidate", "slot", "created"] as const, { key: "created", dir: "desc" });
  const sorted = sortBy(
    filtered,
    (i) => (sort.key === "candidate" ? nameOf(i).toLowerCase() : sort.key === "slot" ? time(chosenSlot(i) ?? i.slot1) : time(i.createdAt)),
    sort.dir,
  );
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
      noun="interviews"
      caption="Interviews"
      searchPlaceholder="Search candidate, company, project…"
      filters={[
        ...pickers,
        {
          key: "status",
          label: "Status",
          options: [
            { value: "pending", label: "Pending" },
            { value: "scheduled", label: "Scheduled" },
            { value: "completed", label: "Completed" },
            { value: "missed", label: "Missed" },
            { value: "expired", label: "Expired" },
            { value: "cancelled", label: "Cancelled" },
          ],
        },
      ]}
      empty={search || params.status || params.company || params.intern || params.tz ? filteredEmpty(params, "interviews") : { title: "No interviews yet", body: "Interviews appear here once a company proposes slots to a candidate." }}
      columns={[
        {
          header: "Candidate",
          sort: "candidate",
          cell: (i) => (
            <IdentityCell name={nameOf(i)} id={i.internId} href={`/admin/interns/${i.internId}`} sub={i.internEmail ?? "-"} size="sm" className="max-w-44" />
          ),
        },
        {
          header: "Company and project",
          cell: (i) => (
            <div className="min-w-0 max-w-44">
              <Link href={`/admin/companies/${i.employerId}?tab=interviews`} className="block truncate font-medium text-foreground hover:underline">
                {i.companyName ?? "Company"}
              </Link>
              <p className="truncate text-xs text-text-subtle">{i.projectName ?? "No project"}</p>
            </div>
          ),
        },
        {
          header: "Slot",
          sort: "slot",
          cell: (i) => {
            const chosen = chosenSlot(i);
            const tz = i.timezone || "Asia/Kolkata";
            if (chosen) {
              return (
                <div className="whitespace-nowrap">
                  <p className="nums whitespace-nowrap font-medium text-foreground">{formatSlotTime(chosen, tz)}</p>
                  <p className="whitespace-nowrap text-xs text-text-subtle">{tz} · picked slot {i.selectedSlot}</p>
                </div>
              );
            }
            const offered = [i.slot1, i.slot2, i.slot3].filter((s): s is Date => Boolean(s));
            return offered.length ? (
              <div className="whitespace-nowrap">
                <ul className="nums space-y-0.5 whitespace-nowrap text-foreground">
                  {offered.map((s, n) => (
                    <li key={n}>{formatSlotTime(s, tz)}</li>
                  ))}
                </ul>
                <p className="whitespace-nowrap text-xs text-text-subtle">{tz} · not picked yet</p>
              </div>
            ) : (
              <span className="text-text-subtle">No slot offered</span>
            );
          },
        },
        {
          // Created rides under the status (its own column pushed the table past 1440).
          header: "Status",
          sort: "created",
          cell: (i) => (
            <div className="flex flex-col items-start gap-1">
              <StatusBadge value={i.status} />
              <span className="nums whitespace-nowrap text-xs text-text-subtle">requested {formatDate(i.createdAt)}</span>
            </div>
          ),
        },
        {
          header: "Meeting link",
          cell: (i) => <MeetingLinkCell interviewId={i.id} link={i.meetingLink} locked={FINISHED_INTERVIEW.includes(i.status.toLowerCase())} awaitingSlot={!i.isAi && !i.selectedSlot} />,
        },
        {
          header: <span className="sr-only">Notes</span>,
          cell: (i) => (i.notes?.trim() ? <InterviewNotesButton title={`${nameOf(i)} · ${i.companyName ?? "Company"}`} notes={i.notes} /> : null),
        },
      ]}
    />
  );
}

function HiredTab({ params, page, perPage, search, pickers, rows }: TabProps & { rows: ProposalItem[] }) {
  const filtered = rows.filter((p) => {
    const offer = parseOffer(p.offerDetails, p.currency);
    return (
      matchesSearch([nameOf(p), p.internEmail, p.internPhone, p.companyName, p.projectName, offer.roleTitle], search) &&
      (!params.kind || (params.kind === "fulltime" ? Boolean(offer.fullTime) : !offer.fullTime))
    );
  });
  const sort = parseSort(params, ["candidate", "company", "start", "hired"] as const, { key: "hired", dir: "desc" });
  const sorted = sortBy(
    filtered,
    (p) =>
      sort.key === "candidate"
        ? nameOf(p).toLowerCase()
        : sort.key === "company"
          ? (p.companyName ?? "").toLowerCase()
          : sort.key === "start"
            ? parseOffer(p.offerDetails, p.currency).startDate
            : time(p.hiredAt ?? p.createdAt),
    sort.dir,
  );
  const pg = paginate(sorted, page, perPage);
  const fullTime = rows.filter((p) => parseOffer(p.offerDetails, p.currency).fullTime).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-subtle">
        <span className="nums font-medium text-foreground">{rows.length}</span> hired: <span className="nums">{rows.length - fullTime}</span> internship,{" "}
        <span className="nums">{fullTime}</span> full-time. Export downloads exactly the rows this filter shows.
      </p>
      <DataTable
        basePath={BASE}
        params={params}
        page={pg.page}
        pages={pg.pages}
        total={pg.total}
        perPage={perPage}
        rows={pg.rows}
        noun="hires"
        caption="Hired candidates"
        searchPlaceholder="Search candidate, company, project, role…"
        filters={[...pickers, { key: "kind", label: "Type", allLabel: "Internship and full-time", options: [{ value: "internship", label: "Internship" }, { value: "fulltime", label: "Full-time" }] }]}
        empty={search || params.kind || params.company || params.intern || params.tz ? filteredEmpty(params, "hired") : { title: "No hires yet", body: "A candidate shows here once the company has paid for an accepted offer." }}
        columns={[
          {
            header: "Candidate",
            sort: "candidate",
            cell: (p) => (
              <IdentityCell name={nameOf(p)} id={p.internId} href={`/admin/interns/${p.internId}`} sub={p.internEmail ?? "-"} size="sm" className="max-w-44" />
            ),
          },
          {
            header: "Company and project",
            sort: "company",
            cell: (p) => (
              <div className="min-w-0 max-w-44">
                <Link href={`/admin/companies/${p.employerId}?tab=hired`} className="block truncate font-medium text-foreground hover:underline">
                  {p.companyName ?? "Company"}
                </Link>
                <p className="truncate text-xs text-text-subtle">{p.projectName ?? "Project"}</p>
              </div>
            ),
          },
          {
            header: "Role",
            cell: (p) => {
              const o = parseOffer(p.offerDetails, p.currency);
              return (
                <div className="min-w-0 max-w-40">
                  <p className="truncate">{o.roleTitle || "-"}</p>
                  <p className="text-xs text-text-subtle">{o.fullTime ? "Full-time" : `Internship · ${o.months} mo`}</p>
                </div>
              );
            },
          },
          {
            header: "Pay",
            align: "right",
            cell: (p) => {
              const o = parseOffer(p.offerDetails, p.currency);
              return (
                <span className="whitespace-nowrap">
                  {o.fullTime
                    ? `${o.fullTime.annualCtcMinor != null ? formatMoney(o.fullTime.annualCtcMinor, o.currency) : "-"} CTC`
                    : o.monthlyMinor != null
                      ? `${formatMoney(o.monthlyMinor, o.currency)}/mo`
                      : "-"}
                </span>
              );
            },
          },
          { header: "Start", sort: "start", cell: (p) => <span className="nums whitespace-nowrap">{formatDate(parseOffer(p.offerDetails, p.currency).startDate)}</span> },
          { header: "Hired on", sort: "hired", cell: (p) => <span className="nums whitespace-nowrap">{formatDate(p.hiredAt ?? p.createdAt)}</span> },
        ]}
      />
    </div>
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
        ]}
      />
    </div>
  );
}
