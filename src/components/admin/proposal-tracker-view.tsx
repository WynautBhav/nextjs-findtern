import Link from "next/link";

import { DataTable, parseSort } from "@/components/admin/data-table";
import { InterviewNotesButton, MeetingLinkCell, ProposalDetailsButton } from "@/components/admin/proposal-tracker-dialogs";
import { StatusBadge } from "@/components/admin/status-badge";
import type { ToolbarFilter } from "@/components/admin/table-toolbar";
import { toQueryString } from "@/lib/admin/params";
import { matchesSearch, paginate, proposalTimezone, sortBy } from "@/lib/admin/tracker";
import { formatDate, formatMoney, formatSlotTime } from "@/lib/format";
import { parseOffer } from "@/lib/offer";
import { acceptanceRate, proposalOutcome } from "@/lib/proposals";
import { cn } from "@/lib/utils";

/**
 * The proposal pipeline's five lists. Server-rendered from rows the page has
 * already filtered by date, company, candidate and timezone; this applies
 * the per-tab search, status filters, sort and page, all from the URL.
 */

export const TRACKER_TABS = ["companies", "proposals", "candidates", "interviews", "hired"] as const;
export type TrackerTab = (typeof TRACKER_TABS)[number];

type ProposalItem = {
  id: string;
  status: string;
  flowType: string | null;
  currency: string | null;
  offerDetails: unknown;
  createdAt: Date | null;
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
  options: { companies: Option[]; interns: Option[]; timezones: Option[] };
}) {
  const hired = proposals.filter((p) => p.status === "hired");
  const candidateIds = new Set(proposals.map((p) => p.internId));
  const activeCompanies = employers.filter((e) => proposals.some((p) => p.employerId === e.id) || interviews.some((i) => i.employerId === e.id));

  const tabs: { key: TrackerTab; label: string; count: number }[] = [
    { key: "companies", label: "Companies", count: activeCompanies.length },
    { key: "proposals", label: "Proposals", count: proposals.length },
    { key: "candidates", label: "Candidates", count: candidateIds.size },
    { key: "interviews", label: "Interviews", count: interviews.length },
    { key: "hired", label: "Hired", count: hired.length },
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
      <nav aria-label="Pipeline view" className="-mx-1 overflow-x-auto px-1">
        <ul className="flex min-w-max gap-1 border-b border-ink-200/80">
          {tabs.map((t) => {
            const active = t.key === tab;
            return (
              <li key={t.key}>
                <Link
                  href={`${BASE}${toQueryString({ ...keep, tab: t.key })}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-600",
                    active ? "border-brand-700 text-ink-900" : "border-transparent text-ink-600 hover:text-ink-900",
                  )}
                >
                  {t.label}
                  <span className={cn("nums rounded-full px-2 py-0.5 text-xs", active ? "bg-brand-50 text-brand-800" : "bg-ink-100 text-ink-600")}>
                    {t.count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "companies" ? <CompaniesTab {...{ params, page, perPage, search, pickers, proposals, interviews }} employers={activeCompanies} /> : null}
      {tab === "proposals" ? <ProposalsTab {...{ params, page, perPage, search, pickers }} rows={proposals} /> : null}
      {tab === "candidates" ? <CandidatesTab {...{ params, page, perPage, search, pickers, proposals }} /> : null}
      {tab === "interviews" ? <InterviewsTab {...{ params, page, perPage, search, pickers }} rows={interviews} /> : null}
      {tab === "hired" ? <HiredTab {...{ params, page, perPage, search, pickers }} rows={hired} /> : null}
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
              <p className="truncate font-medium text-ink-900 group-hover:text-brand-700 group-hover:underline">{r.companyName}</p>
              <p className="truncate text-xs text-ink-600">{[r.city, r.country].filter(Boolean).join(", ") || r.companyEmail}</p>
            </Link>
          ),
        },
        {
          header: "Proposals",
          sort: "proposals",
          align: "right",
          cell: (r) => (
            <Link href={q(r.id, "proposals")} className="font-medium hover:text-brand-700 hover:underline">
              {r.proposals}
            </Link>
          ),
        },
        {
          header: "Interviews",
          sort: "interviews",
          align: "right",
          cell: (r) => (
            <Link href={q(r.id, "interviews")} className="font-medium hover:text-brand-700 hover:underline">
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
  const filtered = rows.filter((p) => {
    const offer = parseOffer(p.offerDetails, p.currency);
    return (
      matchesSearch([nameOf(p), p.internEmail, p.companyName, p.projectName, offer.roleTitle], search) &&
      (!params.status || p.status === params.status) &&
      (!params.flow || p.flowType === params.flow) &&
      (!params.kind || (params.kind === "fulltime" ? Boolean(offer.fullTime) : !offer.fullTime))
    );
  });
  const sort = parseSort(params, ["candidate", "company", "start", "sent"] as const, { key: "sent", dir: "desc" });
  const sorted = sortBy(
    filtered,
    (p) =>
      sort.key === "candidate"
        ? nameOf(p).toLowerCase()
        : sort.key === "company"
          ? (p.companyName ?? "").toLowerCase()
          : sort.key === "start"
            ? parseOffer(p.offerDetails, p.currency).startDate
            : time(p.createdAt),
    sort.dir,
  );
  const pg = paginate(sorted, page, perPage);
  const filtersOn = Boolean(search || params.status || params.flow || params.kind || params.company || params.intern || params.tz);

  return (
    <DataTable
      basePath={BASE}
      params={params}
      page={pg.page}
      pages={pg.pages}
      total={pg.total}
      perPage={perPage}
      rows={pg.rows}
      noun="proposals"
      caption="Proposals"
      searchPlaceholder="Search candidate, company, project, role…"
      filters={[
        ...pickers,
        {
          key: "status",
          label: "Status",
          options: [
            { value: "sent", label: "Sent" },
            { value: "interview_scheduled", label: "Interview scheduled" },
            { value: "accepted", label: "Accepted" },
            { value: "processing", label: "Processing" },
            { value: "hired", label: "Hired" },
            { value: "rejected", label: "Rejected" },
            { value: "expired", label: "Expired" },
            { value: "withdrawn", label: "Withdrawn" },
          ],
        },
        { key: "flow", label: "Flow", options: [{ value: "direct", label: "Direct offer" }, { value: "interview_first", label: "Interview first" }] },
        { key: "kind", label: "Offer type", options: [{ value: "internship", label: "Internship" }, { value: "fulltime", label: "Full-time" }] },
      ]}
      empty={filtersOn ? filteredEmpty(params, "proposals") : { title: "No proposals yet", body: "Offers appear here the moment a company sends one." }}
      columns={[
        {
          header: "Candidate",
          sort: "candidate",
          cell: (p) => (
            <div className="min-w-0 max-w-56">
              <Link href={`/admin/interns/${p.internId}`} className="block truncate font-medium text-ink-900 hover:text-brand-700 hover:underline">
                {nameOf(p)}
              </Link>
              <p className="truncate text-xs text-ink-600">{p.internEmail ?? "-"}</p>
            </div>
          ),
        },
        {
          header: "Company and project",
          sort: "company",
          cell: (p) => (
            <div className="min-w-0 max-w-60">
              <Link href={`/admin/companies/${p.employerId}`} className="block truncate font-medium text-ink-800 hover:underline">
                {p.companyName ?? "Company"}
              </Link>
              <p className="truncate text-xs text-ink-600">{p.projectName ?? "Project"}</p>
            </div>
          ),
        },
        {
          header: "Offer",
          align: "right",
          cell: (p) => {
            const o = parseOffer(p.offerDetails, p.currency);
            return (
              <div className="whitespace-nowrap">
                <p className="font-medium text-ink-900">
                  {o.fullTime
                    ? `${o.fullTime.annualCtcMinor != null ? formatMoney(o.fullTime.annualCtcMinor, o.currency) : "-"} CTC`
                    : o.monthlyMinor != null
                      ? `${formatMoney(o.monthlyMinor, o.currency)}/mo`
                      : "-"}
                </p>
                <p className="text-xs text-ink-600">{o.fullTime ? "Full-time" : `${o.months} mo internship`}</p>
              </div>
            );
          },
        },
        {
          header: "Start",
          sort: "start",
          cell: (p) => {
            const o = parseOffer(p.offerDetails, p.currency);
            const tz = proposalTimezone(p);
            return (
              <div className="whitespace-nowrap">
                <p className="nums">{formatDate(o.startDate)}</p>
                {tz ? <p className="text-xs text-ink-600">{tz}</p> : null}
              </div>
            );
          },
        },
        {
          header: "Status",
          cell: (p) => (
            <div className="flex flex-col items-start gap-1">
              {p.status === "hired" && parseOffer(p.offerDetails, p.currency).fullTime ? <StatusBadge tone="success" label="Full-time hired" /> : <StatusBadge value={p.status} />}
              <span className="text-xs text-ink-600">{p.flowType === "interview_first" ? "Interview first" : "Direct offer"}</span>
            </div>
          ),
        },
        { header: "Sent", sort: "sent", cell: (p) => <span className="nums whitespace-nowrap">{formatDate(p.createdAt)}</span> },
        {
          header: "",
          cell: (p) => (
            <ProposalDetailsButton
              proposal={{
                id: p.id,
                status: p.status,
                currency: p.currency,
                offerDetails: p.offerDetails,
                candidate: nameOf(p),
                companyName: p.companyName ?? "Company",
                projectName: p.projectName ?? "Project",
                flow: p.flowType === "interview_first" ? "Interview first" : "Direct offer",
                sentAt: formatDate(p.createdAt),
              }}
            />
          ),
        },
      ]}
    />
  );
}

function CandidatesTab({ params, page, perPage, search, pickers, proposals }: TabProps & { proposals: ProposalItem[] }) {
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
  const rows = [...byIntern.values()].filter((c) => matchesSearch([c.name, c.email, c.phone, ...c.companies], search));
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
      empty={search || params.company || params.intern || params.tz ? filteredEmpty(params, "candidates") : { title: "No candidates yet", body: "Candidates appear here once a company sends them an offer." }}
      columns={[
        {
          header: "Candidate",
          sort: "name",
          cell: (c) => (
            <div className="min-w-0 max-w-56">
              <Link href={`/admin/interns/${c.internId}`} className="block truncate font-medium text-ink-900 hover:text-brand-700 hover:underline">
                {c.name}
              </Link>
              <p className="truncate text-xs text-ink-600">{c.email ?? "-"}</p>
            </div>
          ),
        },
        { header: "Phone", cell: (c) => <span className="nums whitespace-nowrap">{c.phone ?? "-"}</span> },
        { header: "Received", sort: "received", align: "right", cell: (c) => c.received },
        { header: "Accepted or hired", sort: "won", align: "right", cell: (c) => c.won },
        { header: "Declined", align: "right", cell: (c) => c.lost },
        { header: "Open", align: "right", cell: (c) => c.open },
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
            <div className="min-w-0 max-w-56">
              <Link href={`/admin/interns/${i.internId}`} className="block truncate font-medium text-ink-900 hover:text-brand-700 hover:underline">
                {nameOf(i)}
              </Link>
              <p className="truncate text-xs text-ink-600">{i.internEmail ?? "-"}</p>
            </div>
          ),
        },
        {
          header: "Company and project",
          cell: (i) => (
            <div className="min-w-0 max-w-60">
              <Link href={`/admin/companies/${i.employerId}?tab=interviews`} className="block truncate font-medium text-ink-800 hover:underline">
                {i.companyName ?? "Company"}
              </Link>
              <p className="truncate text-xs text-ink-600">{i.projectName ?? "No project"}</p>
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
                  <p className="nums font-medium text-ink-900">{formatSlotTime(chosen, tz)}</p>
                  <p className="text-xs text-ink-600">{tz} · picked slot {i.selectedSlot}</p>
                </div>
              );
            }
            const offered = [i.slot1, i.slot2, i.slot3].filter((s): s is Date => Boolean(s));
            return offered.length ? (
              <div className="whitespace-nowrap">
                <ul className="nums space-y-0.5 text-ink-700">
                  {offered.map((s, n) => (
                    <li key={n}>{formatSlotTime(s, tz)}</li>
                  ))}
                </ul>
                <p className="text-xs text-ink-600">{tz} · not picked yet</p>
              </div>
            ) : (
              <span className="text-text-subtle">No slot offered</span>
            );
          },
        },
        { header: "Status", cell: (i) => <StatusBadge value={i.status} /> },
        {
          header: "Meeting link",
          cell: (i) => <MeetingLinkCell interviewId={i.id} link={i.meetingLink} locked={FINISHED_INTERVIEW.includes(i.status.toLowerCase())} />,
        },
        { header: "Created", sort: "created", cell: (i) => <span className="nums whitespace-nowrap">{formatDate(i.createdAt)}</span> },
        {
          header: "",
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
      <p className="text-sm text-ink-600">
        <span className="nums font-medium text-ink-900">{rows.length}</span> hired: <span className="nums">{rows.length - fullTime}</span> internship,{" "}
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
              <div className="min-w-0 max-w-56">
                <Link href={`/admin/interns/${p.internId}`} className="block truncate font-medium text-ink-900 hover:text-brand-700 hover:underline">
                  {nameOf(p)}
                </Link>
                <p className="truncate text-xs text-ink-600">{p.internEmail ?? "-"}</p>
              </div>
            ),
          },
          {
            header: "Company and project",
            sort: "company",
            cell: (p) => (
              <div className="min-w-0 max-w-60">
                <Link href={`/admin/companies/${p.employerId}?tab=hired`} className="block truncate font-medium text-ink-800 hover:underline">
                  {p.companyName ?? "Company"}
                </Link>
                <p className="truncate text-xs text-ink-600">{p.projectName ?? "Project"}</p>
              </div>
            ),
          },
          {
            header: "Role",
            cell: (p) => {
              const o = parseOffer(p.offerDetails, p.currency);
              return (
                <div className="min-w-0 max-w-52">
                  <p className="truncate">{o.roleTitle || "-"}</p>
                  <p className="text-xs text-ink-600">{o.fullTime ? "Full-time" : `Internship · ${o.months} mo`}</p>
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
