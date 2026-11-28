import { DataTable, IdentityCell, parseSort } from "@/components/admin/data-table";
import { ExportCsv } from "./export-csv";
import { MeetingView } from "./meeting-view";
import { StageCards, type StageCard } from "./stage-cards";
import { Slots } from "./slots";
import { STAGE_TONE } from "./stage-tone";
import { AdminLoadError, Panel } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { HeatGuide } from "@/components/admin/heat/heat-guide";
import { HeatMark } from "@/components/admin/heat/heat-mark";
import { MEETING_HEAT_GUIDE } from "@/lib/admin/meeting-heat";
import { getSession } from "@/lib/auth";
import { formatDate, formatNumber } from "@/lib/format";
import {
  inStage,
  listMeetings,
  MEETING_DEFAULT_SORT,
  MEETING_SORTS,
  MEETING_STAGE_LABEL,
  MEETING_STAGES,
  EXPIRED_WHY,
  feedbackOrReason,
  sourceLabel,
  TRACK_LABEL,
  type MeetingStage,
} from "@/lib/admin/meeting-stage";
import { loadMeetings, type MeetingRow } from "@/lib/admin/meetings-load";
import { parsePageRequest } from "@/lib/admin/params";
import { canWrite } from "@/lib/admin/permissions";

/**
 * The Pipeline page's Meetings view (/admin/proposal-tracker?view=meetings; /admin/meetings redirects there): every employer interview (not the AI interview) and campus drive call, each in exactly one stage
 * (lib/admin/meeting-stage.ts, the same rows the dashboard's meetings line counts). The stage cards count the rows the
 * other filters leave, and pressing one shows exactly those rows.
 */

/** The combined Pipeline page; `view=meetings` rides on every link this view builds. */
const PATH = "/admin/proposal-tracker";
const HOME = `${PATH}?view=meetings`;

const HINT: Record<MeetingStage | "total", string> = {
  total: "Interviews and drive calls",
  sent: "No slot picked yet",
  accepted: "Booked, still to come",
  completed: "Marked done",
  expired: "Not accepted, missed or never marked",
  withdrawn: "Called off",
};
const DOT: Partial<Record<MeetingStage, string>> = { sent: "bg-warning", accepted: "bg-info", completed: "bg-success" };

export async function MeetingsPipeline({ params }: { params: Record<string, string> }) {
  const req = parsePageRequest(params);
  const sort = parseSort(params, MEETING_SORTS, MEETING_DEFAULT_SORT);
  const session = await getSession();
  const canEditLink = canWrite(session?.permissions, "/api/admin/interviews");

  let all: MeetingRow[];
  try {
    all = (await loadMeetings()).rows;
  } catch (error) {
    console.error("[admin/meetings]", error);
    return (
      <Panel>
        <AdminLoadError what="the meetings" retryHref={HOME} />
      </Panel>
    );
  }

  const { stage, nolink, noLinkCount, counts, listed } = listMeetings(all, params, sort);
  const pages = Math.max(1, Math.ceil(listed.length / req.perPage));
  const page = Math.min(req.page, pages);
  const rows = listed.slice((page - 1) * req.perPage, page * req.perPage);

  const companies = [...new Map(all.map((r) => [r.employerId, r.company])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const cards: StageCard[] = [
    { key: "total", label: "Total", count: counts.total, hint: HINT.total },
    ...MEETING_STAGES.map((s) => ({ key: s, label: MEETING_STAGE_LABEL[s], count: counts[s], hint: HINT[s], dot: DOT[s] })),
  ];
  const filtered = Boolean(req.search || params.type || params.source || params.company || params.heat || stage || nolink);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="nums text-sm text-text-subtle">
          {formatNumber(all.length)} meetings between companies and students; {formatNumber(inStage(all, "accepted").length)} still to come.
        </p>
        <ExportCsv params={Object.fromEntries(Object.entries(params).filter(([k]) => k !== "view"))} />
      </div>

      <StageCards cards={cards} active={stage} noLink={{ count: noLinkCount, on: nolink }} />

      <HeatGuide guide={MEETING_HEAT_GUIDE} />

      <DataTable
        basePath={PATH}
        params={params}
        page={page}
        pages={pages}
        total={listed.length}
        perPage={req.perPage}
        rows={rows}
        rowKey={(r) => r.id}
        noun="meetings"
        caption={stage ? `Meetings: ${MEETING_STAGE_LABEL[stage]}` : "Meetings"}
        searchPlaceholder="Search candidate, company, project or drive…"
        empty={
          filtered
            ? { title: "No meeting matches", body: "Nothing matches this stage, search and these filters.", action: { href: HOME, label: "Clear filters" } }
            : { title: "No meetings yet", body: "Meetings appear here once a company asks a student for one." }
        }
        filters={[
          { key: "type", label: "Meeting type", allLabel: "All types", options: [{ value: "internship", label: "Internship" }, { value: "full_time", label: "Full-time" }] },
          { key: "source", label: "Source", allLabel: "Campus and direct", options: [{ value: "campus", label: "Campus drive" }, { value: "direct", label: "Direct" }] },
          { key: "company", label: "Company", allLabel: "All companies", options: companies.map(([value, label]) => ({ value, label })) },
          { key: "heat", label: "Heat", allLabel: "Any heat", options: [{ value: "hot", label: "Hot" }, { value: "warm", label: "Warm" }, { value: "calm", label: "Calm" }, { value: "closed", label: "Closed" }] },
        ]}
        columns={[
          {
            header: "Candidate",
            sort: "candidate",
            cell: (r) => <IdentityCell name={r.candidate} id={r.internId} href={`/admin/interns/${r.internId}`} size="sm" className="lg:max-w-40" />,
          },
          {
            header: "Employer",
            sort: "company",
            cell: (r) => (
              <IdentityCell name={r.company} id={r.employerId} href={`/admin/companies/${r.employerId}`} sub={r.project ?? (r.kind === "call" ? r.driveTitle : null) ?? undefined} size="sm" className="lg:max-w-44" />
            ),
          },
          {
            header: "Type",
            cell: (r) => (
              <div className="min-w-0">
                <p className="whitespace-nowrap">{TRACK_LABEL[r.track]}</p>
                <p className="whitespace-nowrap text-[0.8125rem] text-text-subtle">{sourceLabel(r)}</p>
              </div>
            ),
          },
          { header: "Round", numeric: true, cell: (r) => (r.round == null ? <span className="text-text-subtle">-</span> : r.round) },
          {
            header: "Status",
            cell: (r) => (
              <div className="min-w-0">
                <StatusBadge {...STAGE_TONE[r.stage]} label={MEETING_STAGE_LABEL[r.stage]} />
                {r.stage === "expired" && EXPIRED_WHY[r.outcome] ? <p className="mt-1 whitespace-nowrap text-[0.8125rem] text-text-subtle">{EXPIRED_WHY[r.outcome]}</p> : null}
              </div>
            ),
          },
          {
            header: "Heat",
            sort: "heat",
            firstDir: "desc",
            cell: (r) =>
              r.heat ? (
                <HeatMark heat={r.heat} id={r.id} />
              ) : (
                <span className="text-text-subtle" title="Closed: nothing to do">
                  –<span className="sr-only">Closed: nothing to do</span>
                </span>
              ),
          },
          { header: "Slots", sort: "scheduled", firstDir: "asc", cell: (r) => <Slots row={r} className="-ml-2" /> },
          {
            header: "Feedback or reason",
            cell: (r) => {
              const text = feedbackOrReason(r);
              return text ? (
                <p className="line-clamp-2 min-w-48 max-w-64 whitespace-normal break-words text-[0.8125rem]" title={text}>
                  {text}
                </p>
              ) : (
                <span className="text-text-subtle">–</span>
              );
            },
          },
          { header: "Created", sort: "created", cell: (r) => <span className="nums whitespace-nowrap text-text-subtle">{formatDate(r.createdAt)}</span> },
          { header: "", label: "", cell: (r) => <MeetingView row={r} canEditLink={canEditLink} /> },
        ]}
      />
    </div>
  );
}
